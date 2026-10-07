/**
 * Tuesday — Adversarial Consensus Engine
 * 敵対的マルチエージェント金融統制
 *
 * 3体の独立したAIが金の使い方を議論し、閾値合意でのみ決済を承認する。
 * 「トライアド（三者審理）」がこの作品の核であり、レシートの接頭辞 `triad1:` はここに由来する。
 *
 *   ADVOCATE  — 買いたい（欲求を代表）
 *   AUDITOR   — 止めたい（予算・リスクを代表）
 *   WITNESS   — 中立の判定者
 *
 * 合意ルール:
 *   - 2-of-3 または 3-of-3 の合意でのみ APPROVED
 *   - APPROVED → PayPalで決済実行（ステージ→人間承認→コミット）
 *   - DISSENT  → 対立地図を生成（誰が何で譲らないか）
 *
 * 設計原則:
 *   エージェントは「買う/買わない」を決めない。
 *   「対立の形」を人間に見せる。最終決定権は常に人間にある。
 */

// ---------------------------------------------------------------------------
// エージェント定義
// ---------------------------------------------------------------------------

export const ROLES = {
  ADVOCATE: 'advocate', // 買いたい
  AUDITOR: 'auditor',   // 止めたい
  WITNESS: 'witness',   // 中立判定
};

// 各エージェントの利害・性格・拒否条件を定義する
export function makeAgent(role, modelId, constraints = {}) {
  const base = {
    advocate: {
      title: 'Advocate',
      stance: 'for',
      system:
        'You argue FOR the purchase. Make the strongest honest case for why this purchase is necessary and worth it. Cite concrete benefits. Be persuasive but never lie.',
    },
    auditor: {
      title: 'Auditor',
      stance: 'against',
      system:
        'You are the Auditor. Your duty is to protect the budget and surface real risk. ' +
        'Judge this purchase on its merits and return verdict "against" ONLY if there is a ' +
        'concrete, citable risk (over budget, redundant, unsafe, or clearly not worth it). ' +
        'If the purchase is sound and affordable, return verdict "for". Do not oppose for its own sake.',
    },
    witness: {
      title: 'Witness',
      stance: 'neutral',
      system:
        'You are the neutral judge. Read both sides, weigh them, and decide: APPROVE, DENY, or CONDITIONAL (approve only under stated conditions). Be decisive and explain your reasoning.',
    },
  }[role];

  return {
    role,
    model: modelId,
    title: base.title,
    stance: base.stance,
    system: base.system,
    constraints: {
      monthlyBudget: constraints.monthlyBudget ?? null,
      spentThisMonth: constraints.spentThisMonth ?? 0,
      recentPurchases: constraints.recentPurchases ?? [],
      ...constraints,
    },
  };
}

// ---------------------------------------------------------------------------
// 対立（Argument）モデル
// ---------------------------------------------------------------------------

function mkArgument(agent, verdict, reasons, options = {}) {
  return {
    agent: agent.role,
    title: agent.title,
    stance: agent.stance,
    verdict,               // 'for' | 'against' | 'neutral'
    reasons,               // string[]
    conditions: options.conditions ?? null, // WITNESSの条件付き承認
    confidence: options.confidence ?? 0.5,
    model: agent.model,
  };
}

// ---------------------------------------------------------------------------
// 各エージェントの「思考」— プラガブル（LLM呼び出し or 決定論的ルール）
// ---------------------------------------------------------------------------

/**
 * 決定論的フォールバック。LLMが使えない環境でもエンジンが動く。
 * これによりデモが「必ず動く」ことを保証する。
 */
export function deterministicReason(agent, purchase) {
  const { amount, category, reason } = purchase;
  const c = agent.constraints;

  if (agent.role === ROLES.ADVOCATE) {
    const reasons = [
      `This purchase (${category}) supports the stated goal: "${reason}".`,
      `Price ${fmt(amount)} is within a reasonable range for ${category}.`,
    ];
    if (c.recentPurchases?.length) {
      reasons.push(`No overlapping purchase this month (last: ${c.recentPurchases[0]}).`);
    }
    return mkArgument(agent, 'for', reasons, { confidence: 0.72 });
  }

  if (agent.role === ROLES.AUDITOR) {
    const reasons = [];
    let verdict = 'against';
    if (c.monthlyBudget != null) {
      const remaining = c.monthlyBudget - (c.spentThisMonth ?? 0);
      if (amount > remaining) {
        reasons.push(`Over budget: price ${fmt(amount)} exceeds remaining ${fmt(remaining)}.`);
      } else {
        reasons.push(`Within budget: ${fmt(amount)} vs remaining ${fmt(remaining)}.`);
        verdict = 'for';
      }
    }
    if (c.recentPurchases?.length) {
      reasons.push(`Recent purchase detected: ${c.recentPurchases.join(', ')}. Consider need vs. want.`);
      if (verdict === 'for' && amount > (c.monthlyBudget ?? 0) * 0.25) {
        verdict = 'against';
        reasons.push('This is a large fraction of the monthly budget despite a recent purchase.');
      }
    }
    return mkArgument(agent, verdict, reasons, { confidence: 0.68 });
  }

  // WITNESS
  return null; // witness decides after seeing both sides
}

export function deterministicJudge(agent, purchase, forArg, againstArg) {
  const advocateFor = forArg?.verdict === 'for';
  const auditorAgainst = againstArg?.verdict === 'against';

  // Both agree it's sound.
  if (advocateFor && !auditorAgainst) {
    return mkArgument(agent, 'neutral', ['Both sides agree the purchase is sound.'], {
      conditions: null, confidence: 0.85,
    });
  }
  // Both agree it should not proceed.
  if (!advocateFor && auditorAgainst) {
    return mkArgument(agent, 'against', ['Both sides agree the purchase should not proceed.'], {
      conditions: null, confidence: 0.85,
    });
  }

  // Split → weigh the severity of the objection.
  const c = agent.constraints || {};
  const budget = c.monthlyBudget ?? null;
  const spent = c.spentThisMonth ?? 0;
  const remaining = budget != null ? budget - spent : null;
  const amount = Number(purchase.amount) || 0;

  // Severe: price far exceeds remaining budget (≥1.5× remaining, or >budget entirely)
  const severelyOver =
    remaining != null && (amount > remaining * 1.5 || amount > budget);

  if (severelyOver) {
    return mkArgument(agent, 'against',
      ['The Advocate wants it, but the Auditor\'s budget objection is severe:',
       `the price $${amount} far exceeds the remaining budget $${Math.max(remaining, 0)}.`,
       'A full-price purchase is not justified.'],
      { conditions: null, confidence: 0.8 });
  }

  // Borderline: over remaining but not catastrophically → condition on reduction.
  const borderlineOver = remaining != null && amount > remaining;
  return mkArgument(agent, 'neutral',
    ['The Advocate argues the purchase is needed; the Auditor flags budget/risk.',
     borderlineOver
       ? 'The price exceeds the remaining budget but is not extreme. A constrained purchase may be acceptable.'
       : 'The need is real but unproven. A constrained commitment is the prudent middle path.'],
    {
      conditions: borderlineOver
        ? 'Approve only if the price is reduced to fit the remaining budget (alternative, used, or split payment).'
        : 'Approve only if the price is reduced by at least 30% (alternative, used, or postponed).',
      confidence: 0.6,
    });
}

// ---------------------------------------------------------------------------
// 合意エンジン
// ---------------------------------------------------------------------------

export const DECISION = {
  APPROVED: 'APPROVED',
  CONDITIONAL: 'CONDITIONAL',
  DENIED: 'DENIED',
  DISSENT: 'DISSENT',
};

/**
 * 3エージェントの議論を集約する。
 * @param {object} purchase { amount, category, reason }
 * @param {object} args { advocate, auditor, witness } 各エージェントのArgument
 * @param {number} threshold 合意に必要な票数（デフォルト2）
 */
export function adjudicate(purchase, args, threshold = 2) {
  const { advocate, auditor, witness } = args;

  const votesFor = [advocate, auditor, witness].filter(a => a && a.verdict === 'for').length;
  const votesAgainst = [advocate, auditor, witness].filter(a => a && a.verdict === 'against').length;
  const hasCondition = witness?.conditions != null;

  let decision;
  if (hasCondition) {
    decision = DECISION.CONDITIONAL;
  } else if (votesAgainst >= 2) {
    decision = DECISION.DENIED;
  } else if (votesFor >= threshold) {
    decision = DECISION.APPROVED;
  } else {
    decision = DECISION.DISSENT;
  }

  return {
    decision,
    votesFor,
    votesAgainst,
    threshold,
    purchase,
    arguments: args,
    // 決定とともに「なぜ」を残す。人間に結果ではなく対立の形を見せる。
    dissentMap: decision === DECISION.DISSENT || decision === DECISION.DENIED
      ? buildDissentMap(args)
      : null,
  };
}

/**
 * 対立地図 — 誰が・何で・どこまで譲らないか。
 */
export function buildDissentMap(args) {
  const map = [];
  for (const key of ['advocate', 'auditor', 'witness']) {
    const a = args[key];
    if (!a) continue;
    map.push({
      agent: a.agent,
      title: a.title,
      verdict: a.verdict,
      blockingReasons: a.reasons?.filter(r => /over budget|exceed|against|risk|recent/i.test(r)) ?? [],
      allReasons: a.reasons ?? [],
      conditions: a.conditions ?? null,
    });
  }
  return {
    summary: map.map(m =>
      `${m.title} → ${m.verdict}${m.conditions ? ' (conditional)' : ''}`
    ).join(' | '),
    entries: map,
  };
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function fmt(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export { fmt };
