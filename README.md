# TRIAD

> **One AI can spend your money. Three AIs have to agree first — and the argument is stamped into the payment record.**

TRIAD is the accountability layer for **agentic commerce**. It replaces a single
rubber-stamp agent with three adversarial ones, and it writes the outcome — *including the
dissent* — into a tamper-evident audit trail that lives inside the PayPal order itself.

A working prototype for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

**Sponsor tools used:** PayPal ✅ · AG Grid ✅ · Channel3 ✅ · WebMCP ✅

> **TRIAD uses PayPal Orders v2 REST + the PayPal Agent Toolkit (MCP) as its settlement layer, and three independent LLMs as its decision layer. PayPal is not decorative — no purchase can be created unless the three agents reach consensus.**

---

## In 10 seconds

| | |
|---|---|
| **The problem** | AI agents can now buy things. Nobody trusts *one* of them to spend your money alone. |
| **The idea** | Advocate argues FOR · Auditor argues AGAINST · Witness judges. Money moves only on consensus. |
| **The novel part** | When they disagree, the disagreement becomes a **receipt** — hashed and stamped into the PayPal order's `custom_id`. The payment record *is* the audit trail. |
| **The proof** | `tests/moneyGate.test.js` shows a DENIED/DISSENT decision creates **0** PayPal orders. `tests/paypalSandbox.live.mjs` proves the stamp round-trips through **real PayPal**. |

## Who this is for

**Small-business finance operators** — the person who signs off on team spend but cannot
personally vet every agent-driven purchase.

PayPal says it is building agentic commerce *"especially for small businesses."* TRIAD is
the accountability layer that makes that safe. It does not make buying easier — it makes
autonomous buying **answerable**.

> **The user story:** Rina runs a 12-person studio. She gives an agent a monthly budget for
> gear. When it tries to buy a $500 headset with only $120 left in the envelope, she doesn't
> get a silent failure — she gets the *argument*: who wanted it, who blocked it, and a hash
> proving that record hasn't been edited.

## The specific problem

Agentic commerce makes buying trivial. **Accountability is the missing layer.**

PayPal is opening its rails to AI agents. The blocker isn't technology — it's **trust**. A
single agent that both *wants* and *approves* a purchase is just a rubber stamp. Nothing yet
records **why** an autonomous purchase was allowed — or **who objected** — in a form a human
(or an auditor, or a regulator) can verify after the fact.

## The Idea

**TRIAD replaces one approving agent with three adversarial ones.**

| Agent | Stance | Job |
|---|---|---|
| **Advocate** | FOR | Argues the purchase is necessary and worth it |
| **Auditor** | AGAINST | Protects the budget; flags cost, risk, opportunity cost |
| **Witness** | NEUTRAL | Judges after hearing both sides |

Money moves **only when the tribunal reaches consensus** (2-of-3, or 3-of-3 for high-value). On dissent, the user doesn't get a bare "no" — they get a **Dissent Map**: who blocked what, and why.

> The agents never *decide*. They surface the shape of disagreement so the **human** can decide. Final approval is always human.

### The novel part: dissent as a tamper-evident record

Multi-agent debate already exists. TRIAD's contribution is not the debate — it is **what happens when consensus fails, and what gets stamped onto the money**:

> *A consensus receipt — decision + all three votes + a SHA-256 fingerprint of each agent's reasoning — is hashed and stamped into the PayPal order's `custom_id` (`triad1:<hash>`). The payment record itself becomes the audit trail. Anyone can re-hash the receipt and prove the record was not altered.*

This is the difference between *"an AI bought this"* and *"here is exactly which agent voted what, on which model, and here is a hash that proves the record is intact."* In agentic commerce, that difference is the whole product.

```bash
# prove the audit trail wasn't tampered with
curl -X POST localhost:8787/api/verify -d '{"orderId":"MOCK-XXXX"}'
# → { ok: true, hashMatches: true, receiptIntact: true,
#     votes: { advocate:"for", auditor:"for", witness:"neutral" },
#     models: { advocate:"deepseek-v4.1-flash", ... } }
```

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
src/receipt.js     — Consensus receipt: canonical hash of decision + votes + reasoning fingerprints
src/channel3.js    — Channel3 product-catalog adapter (50M+ SKUs, + curated fallback)
src/commerce.js    — Shop flow: Channel3 candidates → TRIAD adjudication
src/webmcp.js      — Registers TRIAD as WebMCP tools + orchestrates PayPal settlement
paypal/client.js   — PayPal Orders v2 REST client (Sandbox, + mock fallback)
demo/server.mjs    — Zero-dependency HTTP server
demo/index.html    — Demo UI (AG Grid candidate table + live ledger)
tests/moneyGate.test.js — The money gate, mechanically proven (createOrder 0× on non-consensus)
tests/smoke.sh     — End-to-end smoke test against the running server
```

### Decision states
- `APPROVED` — ≥2 agents for, no blocking condition
- `CONDITIONAL` — Witness approves only under a stated condition (e.g. "reduce price 30%")
- `DENIED` — ≥2 agents against → **no PayPal order can be created**
- `DISSENT` — no consensus → dissent map returned

## Sponsor Tool Integration

| Tool | How TRIAD uses it |
|---|---|
| **PayPal** | Orders v2 REST API (create + capture) **+ PayPal Agent Toolkit / MCP** (`create_order` / `get_order` / `pay_order` / `create_refund` / `list_disputes`). Sandbox mode; deterministic fallback when no key. |
| **AG Grid** | Live candidate-comparison grid + decision ledger (sortable, filterable). |
| **Channel3** | Product discovery — grounds each debate in a real, purchasable SKU (real API, no mocks). |
| **WebMCP** | Exposes TRIAD as page tools so any agent (Chrome 146+) can invoke it. |

## PayPal Developer Platform usage (depth)

TRIAD does not treat PayPal as a checkout button. PayPal is the settlement layer that the entire governance model depends on — and it is used across four surfaces:

- **Agent Toolkit / MCP** — the official agent-facing layer: `create_order`, `get_order`, `pay_order`, `create_refund`, `list_disputes`. This is how the three agents actually settle a consensus.
- **Orders v2 REST** — direct order lifecycle: create → approval link → capture. Used as the ground truth for the money gate.
- **Disputes v1** — `list` / `get`. Feeds the "Dispute Replay" mode: adjudicate a real dispute as if it were a purchase decision.
- **Invoicing v2** — create → send (two-step). Used for B2B-style spend requests that need the same adversarial review.

### The money gate (mechanically enforced)

A DENIED or DISSENT adjudication **cannot produce a PayPal order** — this is not a UI rule, it is enforced in code and proven by a test:

```bash
node tests/moneyGate.test.js   # asserts createOrder is called 0 times on DENIED/DISSENT
```

Most "AI spending" demos prove that an agent *can* buy. TRIAD proves that it *cannot* — unless three independent agents agree. That asymmetry is the point.

### Proven against the real PayPal sandbox

The claim above is not proven against a mock. It is proven against **PayPal itself**:

```bash
PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node tests/paypalSandbox.live.mjs
```

```
token OK (expires_in=30566, app_id=APP-3C860634L8444660B)
receipt hash: 40afacbb8ff165b6 -> custom_id: triad1:40afacbb8ff165b6
order OK id=9WF514175M434994P status=CREATED
round-trip custom_id=triad1:40afacbb8ff165b6 MATCH=true
disputes v1 reachable: OK
ALL LIVE PAYPAL SANDBOX CHECKS PASSED
```

It performs five things against the live sandbox API: (1) OAuth token, (2) a consensus
receipt hash, (3) a **real PayPal order** carrying that hash in `custom_id`,
(4) a re-fetch proving the stamp survived the round-trip, and (5) a Disputes v1 scope check.
Judges can reproduce this with the sandbox credentials in `SETUP.md`.

> Sandbox credentials are public-safe (test money only). Never commit live credentials.

## WebMCP Tools

| Tool | Purpose |
|---|---|
| `triadShop` | Channel3 candidates → TRIAD adjudication → consensus recommendation |
| `triadAdjudicate` | Run the 3-agent debate → decision + dissent map + consensus receipt |
| `triadCreateOrder` | Create a PayPal order for an approved purchase (stamps the receipt hash into `custom_id`) |
| `triadCaptureOrder` | Capture (finalize) — the human-approval step |
| `triadGetLedger` | Read-only audit log of every adjudication (with receipt hashes) |
| `triadVerifyReceipt` | Read-only: re-hash the receipt and prove the PayPal `custom_id` audit trail is intact |

## Run It

```bash
# Zero config — deterministic engine + mock PayPal + mock catalog. Always runs.
node demo/server.mjs
#    → http://localhost:8787

npm test            # money-gate proof + engine tests (no API key needed)
npm run test:gate   # just the money gate
npm run test:smoke  # boots the real server and drives the full API
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
