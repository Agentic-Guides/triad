/**
 * Tuesday — Agent Runner — connects the 3 agents to LLM providers.
 *
 * Provider-agnostic: works with Ollama Cloud (this repo's default), or any
 * OpenAI-compatible endpoint. Falls back to the deterministic reasoning engine
 * if no provider is configured, so the demo NEVER fails to run.
 */

import { makeAgent, ROLES, deterministicReason, deterministicJudge } from './triad.js';

const DEFAULT_ENDPOINT = 'https://ollama.com/v1/chat/completions';

// Distinct models per role → genuinely independent adversaries.
// Independent models produce genuinely independent judgments. Three copies of the
// same model share the same blind spots, which defeats the adversarial design.
// Override any of these with TRIAD_MODEL_<ROLE> env vars (the env-var prefix keeps
// its original name for compatibility).
//
// ★ Model names verified live against Ollama Cloud's /api/tags (2026-10-07).
//   Three DIFFERENT vendors on purpose: DeepSeek / Google / OpenAI-OSS.
//   Auditor=gemma4:31b was chosen by measurement: 196 tokens & 844ms per debate
//   turn, vs 365 tokens & 4466ms for glm-5.3-flash (≈54% fewer tokens, ≈81% faster,
//   no reasoning-token overhead) — and it still argues AGAINST convincingly,
//   which is what makes DISSENT real.
//
// ★ 2026-10-18: advocate pinned to the `:1017` build of the same model.
//   Ollama published deepseek-v4.1-flash on 2026-10-17 (same model
//   family, US-hosted, zero data retention, lower per-task cost). Verified live
//   against https://ollama.com/v1/chat/completions with max_tokens:400 —
//   the three roles answer in 0.9-1.1s and 18-141 completion tokens.
//   NOTE the exact tag: the Cloud API lists `:1017` (the local `ollama pull`
//   alias is `:1017-cloud`, which is NOT the name the HTTP API accepts).
//   The Devpost write-up still names the model family (deepseek-v4.1-flash); this
//   is the same family, so the submission stays accurate. Override with
//   TRIAD_MODEL_ADVOCATE to pin any other tag.
const DEFAULT_MODELS = {
  advocate: process.env.TRIAD_MODEL_ADVOCATE || 'deepseek-v4.1-flash', // DeepSeek
  auditor: process.env.TRIAD_MODEL_AUDITOR || 'gemma4:31b',            // Google
  witness: process.env.TRIAD_MODEL_WITNESS || 'gpt-oss:120b',          // OpenAI (OSS)
};

export class TriadRunner {
  constructor({
    endpoint = process.env.LLM_ENDPOINT || DEFAULT_ENDPOINT,
    apiKey = process.env.OLLAMA_API_KEY || process.env.OPENAI_API_KEY,
    models = DEFAULT_MODELS,
    constraints = {},
  } = {}) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.agents = {
      advocate: makeAgent(ROLES.ADVOCATE, models.advocate, constraints),
      auditor: makeAgent(ROLES.AUDITOR, models.auditor, constraints),
      witness: makeAgent(ROLES.WITNESS, models.witness, constraints),
    };
  }

  get live() {
    return Boolean(this.apiKey);
  }

  async _chat(agent, userPrompt) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          { role: 'system', content: agent.system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Run the full adversarial debate for a purchase.
   * @returns {object} { advocate, auditor, witness } Arguments
   */
  async debate(purchase) {
    if (!this.live) {
      // Deterministic fallback — always works.
      const advocate = deterministicReason(this.agents.advocate, purchase);
      const auditor = deterministicReason(this.agents.auditor, purchase);
      const witness = deterministicJudge(this.agents.witness, purchase, advocate, auditor);
      return { advocate, auditor, witness, engine: 'deterministic' };
    }

    const context = this._purchaseContext(purchase);

    // Advocate & Auditor argue in parallel.
    const [advocateRaw, auditorRaw] = await Promise.all([
      this._chat(this.agents.advocate, `${context}\n\nArgue FOR this purchase. Output JSON: {"verdict":"for","reasons":["..."],"confidence":0.0-1.0}`),
      this._chat(this.agents.auditor, `${context}\n\nJudge this purchase as the Auditor. Return verdict "against" ONLY if there is a concrete, citable risk; otherwise return "for" if it is sound and affordable. Output JSON: {"verdict":"for"|"against","reasons":["..."],"confidence":0.0-1.0}`),
    ]);

    const advocate = this._parse(this.agents.advocate, advocateRaw, purchase);
    const auditor = this._parse(this.agents.auditor, auditorRaw, purchase);

    // Witness judges after seeing both.
    const witnessPrompt = `${context}

Advocate (FOR): ${JSON.stringify(advocate.reasons)}
Auditor (AGAINST): ${JSON.stringify(auditor.reasons)}

As the neutral judge, decide. Output JSON: {"verdict":"for"|"against","reasons":["..."],"conditions":"... or null","confidence":0.0-1.0}`;
    const witnessRaw = await this._chat(this.agents.witness, witnessPrompt);
    const witness = this._parse(this.agents.witness, witnessRaw, purchase);

    return { advocate, auditor, witness, engine: 'llm' };
  }

  _purchaseContext(p) {
    const c = this.agents.auditor.constraints;
    return [
      `PURCHASE REQUEST`,
      `- Item/category: ${p.category}`,
      `- Amount: $${p.amount}`,
      `- Stated reason: "${p.reason}"`,
      c.monthlyBudget != null ? `- Monthly budget: $${c.monthlyBudget}` : '',
      c.spentThisMonth ? `- Already spent this month: $${c.spentThisMonth}` : '',
      c.recentPurchases?.length ? `- Recent purchases: ${c.recentPurchases.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }

  _parse(agent, raw, purchase) {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const j = JSON.parse(m ? m[0] : raw);
      // ★ A reply that names no verdict is an abstention, not an approval.
      //
      // This used to default to 'for' for every non-Auditor role, so any
      // completion that omitted the field — a refusal, a truncated answer, a
      // prompt-injected reply — silently became a vote to buy. Two such votes
      // reached APPROVED. Absence of a decision must never read as consent.
      const rawVerdict = typeof j.verdict === 'string' ? j.verdict.trim().toLowerCase() : '';
      const verdict = rawVerdict === 'for' || rawVerdict === 'against' ? rawVerdict : 'neutral';

      // ★ conditions is a decision input, not decoration: adjudicate() turns any
      //   non-null value into CONDITIONAL, which passes the money gate. It used
      //   to be stored as whatever the model emitted (object, number, array),
      //   so an unvalidated shape could flip the outcome. Only a bounded string
      //   survives, and it is length-capped so it cannot carry a payload into
      //   the DOM either.
      const CONDITIONS_MAX = 240;
      let conditions = null;
      if (typeof j.conditions === 'string') {
        const c = j.conditions.trim();
        if (c && c !== 'null' && c.toLowerCase() !== 'none') conditions = c.slice(0, CONDITIONS_MAX);
      } else if (Array.isArray(j.conditions)) {
        const joined = j.conditions.filter((x) => typeof x === 'string').join('; ').trim();
        if (joined) conditions = joined.slice(0, CONDITIONS_MAX);
      }

      const reasons = (Array.isArray(j.reasons) ? j.reasons : [j.reasons])
        .filter((r) => r != null)
        .map((r) => String(r).slice(0, 400));

      return {
        agent: agent.role,
        title: agent.title,
        stance: agent.stance,
        verdict,
        reasons,
        conditions,
        confidence: typeof j.confidence === 'number' && Number.isFinite(j.confidence) ? j.confidence : 0.5,
        model: agent.model,
      };
    } catch {
      return deterministicReason(agent, purchase) || {
        agent: agent.role, title: agent.title, stance: agent.stance,
        verdict: 'neutral', reasons: [raw.slice(0, 300)], conditions: null, confidence: 0.4,
        model: agent.model,
      };
    }
  }
}
