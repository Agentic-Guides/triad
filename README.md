# Tuesday

[![M8ven Score](https://m8ven.ai/badge/mcp/agentic-guides-triad-1c26hx?v=a384828d0b931b9c0be97b1d979e5dfe)](https://m8ven.ai/mcp/agentic-guides-triad-1c26hx?s=readme)

> **Anna's skincare brand bills $42 a month to 12,000 subscribers. Tuesday, 3 AM: a renewal fails. Three AI agents debate whether to retry, downgrade, or let the customer go — and a real PayPal subscription is updated on their consensus. The brand approves. The customer can object. The proof is stamped into the payment record.**

A working prototype for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

**Sponsor tools used:** PayPal ✅ · AG Grid ✅ · Bryntum ✅ · Channel3 ✅

> **Tuesday runs on the official PayPal Agent Toolkit (MCP) — the same `@paypal/mcp` server PayPal ships — plus PayPal Orders v2 REST and Subscriptions v1. Three independent LLMs decide; PayPal settles. Nothing is renewed unless the three agents agree and a human signs off.**

---

## In 10 seconds

| | |
|---|---|
| **The brand** | A US skincare subscription brand. **$42 a month, ~12,000 subscribers.** |
| **The moment** | **Tuesday, 3 AM. A renewal fails.** Card declined. Multiply that by thousands of subscribers. |
| **Why it matters** | **25–40% of subscription churn starts exactly here** — at a failed payment, not a lost customer. |
| **The idea** | Three AI agents read the failed renewal and argue: **retry**, **downgrade**, or **release**. A consensus updates the subscription through PayPal. The brand approves; the customer can object. |
| **The novel part** | The decision — *including the disagreement* — is hashed and stamped into the payment record itself. The receipt **is** the audit trail. |
| **The proof** | Live against the **real PayPal sandbox**: a product, a subscription plan, and a subscription, created through PayPal's own MCP server. No mock. |

## Who this is for

**US subscription brands selling physical goods** — skincare, supplements, consumables — the
operator who loses real revenue every month to renewals that quietly fail, and cannot chase every
declined card by hand.

**And the subscriber on the other side** of that renewal, who should never be re-billed without
seeing why, and should always be able to say *no*.

> **The story, in one line:** *A failed $42 renewal on Tuesday becomes a reviewed, provable,
> human-approved payment — without the customer ever being lost to a silent decline.*

## The specific problem

PayPal's own business runs on **branded checkout and recurring billing**, and both are under
pressure. Its [most recent results](https://investor.pypl.com/) show branded checkout volume stuck
at **+2%** for a second straight quarter while **Apple Pay, Klarna, and Shop Pay** close in. The
growth PayPal is betting on is **AI agents that pay on a customer's behalf** — its own definition of
agentic commerce, which
[PayPal projects](https://www.paypal.com/us/brc/article/agentic-commerce-pulse-report-findings) will
reach **$1.7 trillion by 2030**.

But **recurring billing has a hole nobody has filled: the failure path.**

When a renewal fails, today's options are crude: retry blindly, or cancel. There is no *judgement*,
and no *record* of why the decision was made. Industry benchmarks show that **25–40% of subscription
churn is involuntary** — the customer never chose to leave; the payment just failed — and that it is
*"a payments-infrastructure problem with a technical fix."* For a brand billing real customers, that
is the difference between a recovered subscriber and a silent loss.

## What Tuesday does

**It puts three independent AI agents on the failed-renewal path, and makes PayPal the place the
decision lands.**

| Agent | Model (different vendor each) | Job |
|---|---|---|
| **Advocate** | `deepseek-v4.1-flash` (DeepSeek) | Argues to retry — the subscriber is valuable, the failure looks technical |
| **Auditor** | `gemma4:31b` (Google) | Opposes only on a concrete, citable risk — repeated failures, churn pattern, margin loss |
| **Witness** | `gpt-oss:120b` (OpenAI OSS) | Judges both sides and decides: retry / downgrade / release |

**Three different vendors on purpose.** Three copies of the same model share the same blind spots —
which defeats the entire point of an adversarial review. (Measurement: the Auditor model was chosen
at 196 tokens / 844 ms per turn, versus 365 tokens / 4,466 ms for the alternative.)

The renewal moves **only on consensus**, and the outcome is written into the payment record.

### The novel part: a disagreement you can verify

Multi-agent debate is not new. What is new is **what happens when they disagree, and what gets
stamped onto the money**:

> A consensus receipt — decision + all three votes + a SHA-256 fingerprint of each agent's reasoning —
> is hashed and stamped into the PayPal record's `custom_id` (`triad1:<hash>`). Anyone can re-hash the
> receipt and prove the record was not altered.
>
> *A note on the prefix:* the stamp reads `triad1:` because the three-agent tribunal — the **triad** —
> is the core of this product. The prefix predates the project's rename and is kept deliberately: it is
> already written into live PayPal sandbox records, and changing it would invalidate the round-trip
> proof below. It names the mechanism, not the product.

That is the difference between *"an AI renewed this subscription"* and *"here is exactly which agent
voted what, on which model, and here is a hash proving the record is intact."*

## How it works, end to end

```
Tuesday 03:00 — a subscription renewal fails (card declined)
        ↓
PayPal reports the failure
        ↓
Tuesday's tribunal (3 independent LLMs, 3 vendors)
   Advocate : "retry — this subscriber has paid 14 months in a row"
   Auditor  : "against — third failure this quarter, the card is dead"
   Witness  : "conditional — retry once, then downgrade"
        ↓
CONSENSUS?  ── no ──→  nothing is created. The dissent map is returned to the brand.
        │
       yes
        ↓
PayPal Agent Toolkit (MCP) + Subscriptions v1 / Orders v2
   → the renewal is created through PayPal's MCP server
   → the receipt hash is stamped into custom_id
        ↓
The brand approves in one tap. The subscriber sees exactly what happened, and can object.
        ↓
AG Grid  — ledger of every decision, vote, and hash
Bryntum  — the renewal timeline: which failures are still open
```

## Architecture

```
src/triad.js       — Adversarial consensus engine (roles, arguments, adjudicate, dissent map)
src/runner.js      — Runs the 3 agents on 3 different vendors' models (Ollama Cloud)
src/receipt.js     — Consensus receipt: canonical hash of decision + votes + reasoning fingerprints
src/channel3.js    — Channel3 product-catalog adapter (real API)
src/commerce.js    — Shop flow: Channel3 candidates → tribunal adjudication
src/webmcp.js      — Registers the tribunal as WebMCP tools + orchestrates PayPal settlement
paypal/client.js   — PayPal Orders v2 REST client (Sandbox, + deterministic mock fallback)
paypal/mcpClient.js— PayPal Agent Toolkit (MCP) adapter — the official agent-facing layer
demo/server.mjs    — Zero-dependency HTTP server
demo/index.html    — Demo UI (AG Grid ledger + Bryntum renewal timeline)
tests/moneyGate.test.js — The money gate, mechanically proven (0 records on non-consensus)
tests/paypalSandbox.live.mjs — Live proof against the real PayPal sandbox
tests/channel3.live.mjs      — Live proof against the real Channel3 API
```

### Decision states
- `APPROVED` — ≥2 agents for, no blocking condition → the renewal may proceed
- `CONDITIONAL` — the Witness approves only under a stated condition ("retry once, then downgrade")
- `DENIED` — ≥2 agents against → **nothing may be created**
- `DISSENT` — no consensus → the dissent map is returned to the human

## PayPal Developer Platform usage (depth)

This is not a checkout button. PayPal is the settlement layer the whole model depends on, and it
is used across **five** surfaces:

| Surface | How it is used |
|---|---|
| **Agent Toolkit / MCP** (`@paypal/mcp`) | The official agent-facing layer. The agents call **`create_product`, `create_subscription_plan`, `list_subscription_plans`, `create_subscription`, `show_subscription_details`, `cancel_subscription`** through PayPal's own MCP server. |
| **Orders v2 REST** | Order lifecycle: create → approval link → capture. The ground truth for the money gate. |
| **Subscriptions v1** | Product → plan → subscription → approval. The recurring-billing path this project is built around. |
| **Disputes v1** | `list` / `get` — reachable from the same client. |
| **WebMCP** | Exposes the whole flow as page tools, so any agent browser can drive it. |

### Proven live through PayPal's own MCP server

The claim is not a mock. It was run against the **real PayPal sandbox**, through the **official
`@paypal/mcp` server** (serverInfo: `PayPal v1.11.0`, 28 tools registered):

```bash
npx -y @paypal/mcp@1.8.1 --tools=all      # PAYPAL_ACCESS_TOKEN + PAYPAL_ENVIRONMENT=SANDBOX
```

```
create_product            → PROD-60748010N1494543C
create_subscription_plan  → P-373849401N470725XNLC2ABY   status=ACTIVE
create_subscription       → I-1V5J40E95883                status=APPROVAL_PENDING
   approve: https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=...
show_subscription_details → status APPROVAL_PENDING, custom_id triad1:annapays01
list_subscription_plans   → 1 plan
```

And the same receipt mechanism round-trips through the REST API:

```
node tests/paypalSandbox.live.mjs
  token OK (app_id=APP-3C860634L8444660B)
  receipt hash: 40afacbb8ff165b6 -> custom_id: triad1:40afacbb8ff165b6
  order OK id=9WF514175M434994P status=CREATED
  round-trip custom_id=triad1:40afacbb8ff165b6 MATCH=true
  ALL LIVE PAYPAL SANDBOX CHECKS PASSED
```

### And live through three real LLMs

The adversarial layer runs on three genuinely independent models — verified live, no env overrides:

```
A budget has room    → APPROVED  3f/0a   A=for  B=for      W=for
B budget nearly full → APPROVED  3f/0a   A=for  B=for      W=for
C over budget        → DENIED    1f/2a   A=for  B=against  W=against
```

Both paths — the consensus path **and** the money gate — demonstrably fire against real models.

### The money gate (mechanically enforced)

A DENIED or DISSENT adjudication **cannot produce a payment** — enforced in code, proven by a test:

```bash
node tests/moneyGate.test.js   # asserts createOrder is called 0 times on DENIED/DISSENT
```

Most "AI spending" demos prove an agent *can* pay. This one proves it **cannot** — unless three
independent agents agree, and a human signs off.

> **A note on PayPal's design.** In the sandbox, an `APPROVAL_PENDING` subscription **cannot be
> activated by an API call** — PayPal requires the buyer to approve. We verified this directly
> (`POST /activate` → 422). That is not a limitation we worked around; it is the point. PayPal has
> built human consent into the payment structure, which is exactly what makes agentic commerce
> trustworthy.

## WebMCP Tools

| Tool | Purpose |
|---|---|
| `triadShop` | Channel3 candidates → tribunal adjudication → consensus recommendation |
| `triadAdjudicate` | Run the 3-agent debate → decision + dissent map + consensus receipt |
| `triadCreateOrder` | Create a PayPal order for an approved purchase (stamps the receipt hash into `custom_id`) |
| `triadCaptureOrder` | Capture (finalize) — the human-approval step |
| `triadGetLedger` | Read-only audit log of every adjudication (with receipt hashes) |
| `triadVerifyReceipt` | Re-hash the receipt and prove the PayPal `custom_id` audit trail is intact |

## Run It

```bash
# Zero config — deterministic engine + mock PayPal + mock catalog. Always runs.
node demo/server.mjs
#    → http://localhost:8787

npm test            # money-gate proof + engine tests (no API key needed)
npm run test:gate   # just the money gate
npm run test:smoke  # boots the real server and drives the full API
```

Judges can run the whole thing with **no keys at all** — every integration degrades gracefully.

### Optional: enable the live integrations

```bash
export OLLAMA_API_KEY=...            # → live AI agents (3 vendors)
export PAYPAL_CLIENT_ID=...          # → live PayPal orders (sandbox)
export PAYPAL_CLIENT_SECRET=...
export CHANNEL3_API_KEY=...          # → live product catalog
node demo/server.mjs
```

## Sponsor Tool Integration

| Tool | How it is used |
|---|---|
| **PayPal** | Agent Toolkit / MCP (`create_subscription`, `cancel_subscription`, `create_order`, …) + Orders v2 REST + Subscriptions v1. Sandbox; deterministic fallback when no key. |
| **AG Grid** | The decision ledger — every renewal, every vote, every receipt hash, with a selection-driven receipt panel. |
| **Bryntum Scheduler** | The renewal timeline — who decided what, when, and which failed renewals are still unresolved. |
| **Channel3** | Product discovery — grounds the debate in a real, purchasable SKU (real API, no mocks). |

## Impact

Recurring billing is where PayPal makes its money, and **the failure path is where brands lose
customers.** Tuesday turns a failed renewal into a reviewed, provable, human-approved
decision — recovered revenue for the brand, and a record the subscriber can trust.

The pattern generalises to *any* high-stakes agent action: subscription changes, refunds, payouts.
**Adversarial review + surfaced dissent + a human final call + a tamper-evident record** is what
makes autonomous money trustworthy.

## License

MIT — see [LICENSE](LICENSE).
