# TRIAD

**Three independent AI agents debate your purchase. Money moves only on consensus.**

A working prototype for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) — agentic commerce with adversarial AI governance.

**Sponsor tools used:** PayPal ✅ · AG Grid ✅ · Channel3 ✅ · WebMCP

---

## The Problem

PayPal is opening its platform to AI agents. The blocker isn't technology — it's **trust**. Nobody is comfortable letting a single AI agent autonomously spend their money. A single agent that both *wants* and *approves* a purchase is just a rubber stamp.

**How do you let agents act autonomously — without letting them run unchecked?**

## The Idea

**TRIAD replaces one approving agent with three adversarial ones.**

| Agent | Stance | Job |
|---|---|---|
| **Advocate** | FOR | Argues the purchase is necessary and worth it |
| **Auditor** | AGAINST | Protects the budget; flags cost, risk, opportunity cost |
| **Witness** | NEUTRAL | Judges after hearing both sides |

Money moves **only when the tribunal reaches consensus** (2-of-3, or 3-of-3 for high-value). On dissent, the user doesn't get a bare "no" — they get a **Dissent Map**: who blocked what, and why.

> The agents never *decide*. They surface the shape of disagreement so the **human** can decide. Final approval is always human.

## How It Works (end to end)

```
User: "I need headphones, budget $800, spent $120"
  ↓
Channel3 → returns candidate products (Sony XM5, refurb Bose QC45, …)
  ↓
TRIAD → Advocate argues FOR the Sony XM5
        Auditor checks price vs remaining budget
        Witness weighs both → APPROVE / CONDITIONAL / DENY
  ↓
APPROVED → PayPal order created → approval link → (human) capture
DENIED   → NO PayPal order can be created — physically blocked
  ↓
AG Grid → live ledger of every adjudication + candidate comparison table
```

## Architecture

```
src/triad.js       — Adversarial consensus engine (roles, arguments, adjudicate, dissent map)
src/runner.js      — Runs the 3 agents on LLMs (Ollama Cloud / any OpenAI-compatible endpoint)
src/channel3.js    — Channel3 product-catalog adapter (50M+ SKUs, + curated fallback)
src/commerce.js    — Shop flow: Channel3 candidates → TRIAD adjudication
src/webmcp.js      — Registers TRIAD as WebMCP tools + orchestrates PayPal settlement
paypal/client.js   — PayPal Orders v2 REST client (Sandbox, + mock fallback)
demo/server.mjs    — Zero-dependency HTTP server
demo/index.html    — Demo UI (AG Grid candidate table + live ledger)
```

### Decision states
- `APPROVED` — ≥2 agents for, no blocking condition
- `CONDITIONAL` — Witness approves only under a stated condition (e.g. "reduce price 30%")
- `DENIED` — ≥2 agents against → **no PayPal order can be created**
- `DISSENT` — no consensus → dissent map returned

## Sponsor Tool Integration

| Tool | How TRIAD uses it |
|---|---|
| **PayPal** | Orders v2 REST API (create + capture). Sandbox mode; mock fallback when no key. |
| **AG Grid** | Live candidate-comparison grid + decision ledger (sortable, filterable). |
| **Channel3** | Product discovery — grounds each debate in a real, purchasable SKU. |
| **WebMCP** | Exposes TRIAD as page tools so any agent (Chrome 146+) can invoke it. |

## WebMCP Tools

| Tool | Purpose |
|---|---|
| `triadShop` | Channel3 candidates → TRIAD adjudication → consensus recommendation |
| `triadAdjudicate` | Run the 3-agent debate → decision + dissent map |
| `triadCreateOrder` | Create a PayPal order for an approved purchase |
| `triadCaptureOrder` | Capture (finalize) — the human-approval step |
| `triadGetLedger` | Read-only audit log of every adjudication |

## Run It

```bash
# Zero config — deterministic engine + mock PayPal + mock catalog. Always runs.
node demo/server.mjs
#    → http://localhost:8787

node test_triad.mjs      # tests
```

### Optional: enable live integrations

```bash
export PAYPAL_CLIENT_ID=...          # PayPal Sandbox  → live orders
export PAYPAL_CLIENT_SECRET=...
export CHANNEL3_API_KEY=...          # Channel3        → live catalog
export OLLAMA_API_KEY=...            # LLM             → live AI agents
export LLM_ENDPOINT=https://ollama.com/v1/chat/completions   # optional
node demo/server.mjs
```

Every integration degrades gracefully — the demo **always** runs, with or without keys.

## Try These Cases

| Category | Budget | Spent | Max | Result |
|---|---|---|---|---|
| headphones | 800 | 120 | 500 | APPROVED (Sony XM5) |
| watch | 800 | 120 | 500 | APPROVED (Seiko) |
| laptop | 1500 | 1200 | 1200 | budget-constrained evaluation |
| anything | 1000 | 950 | — | DENIED (no order creatable) |

## Impact

"AI agents that spend money" is coming. The unsolved question is **governance**. TRIAD is a reusable control layer for *any* high-stakes agent action: purchases, subscription changes, transfers, Payouts. The pattern — *adversarial review + surfaced dissent + human final call* — is what makes autonomy trustworthy.

## License

MIT — see [LICENSE](LICENSE).
