# SETUP — Running TRIAD

TRIAD runs in **two modes**: `MOCK` (no credentials needed — the demo always runs) and
`SANDBOX` (real PayPal sandbox orders). Judges can use either.

---

## 1. Zero-setup (MOCK mode)

```bash
node demo/server.mjs
# open http://localhost:8787
```

No credentials, no installs. The full 3-agent debate, Dissent Map, receipt hashing, and
the money gate all run deterministically against PayPal's *mock* client, so you can see the
complete experience immediately.

---

## 2. Real PayPal sandbox (SANDBOX mode)

TRIAD talks to the PayPal REST **Orders v2** API directly — no SDK, no `npm install`.

### Sandbox credentials (public-safe — test money only)

```bash
export PAYPAL_CLIENT_ID=PAYPAL_CLIENT_ID_REMOVED_create_your_own_sandbox_app
export PAYPAL_CLIENT_SECRET=PAYPAL_CLIENT_SECRET_REMOVED_rotate_your_own
```

- Base URL: `https://api-m.sandbox.paypal.com`
- These are **sandbox** credentials. No real money can move. They are safe to publish.
- Get your own at <https://developer.paypal.com/dashboard/applications/sandbox>.

### Verify against the real API

```bash
node tests/paypalSandbox.live.mjs
```

Expected output:

```
mode: SANDBOX
token OK (expires_in=..., app_id=APP-3C860634L8444660B)
receipt hash: 40afacbb8ff165b6 -> custom_id: triad1:40afacbb8ff165b6
order OK id=... status=CREATED
round-trip custom_id=triad1:40afacbb8ff165b6 MATCH=true
disputes v1 reachable: OK
ALL LIVE PAYPAL SANDBOX CHECKS PASSED
```

---

## 3. Tests

```bash
node tests/moneyGate.test.js         # money gate: createOrder is 0× on DENIED/DISSENT
bash tests/smoke.sh                  # end-to-end against the running server
node tests/paypalSandbox.live.mjs    # live PayPal sandbox (needs credentials above)
node test_triad.mjs                  # core adjudication unit tests
```

---

## 4. What each test proves

| Test | Proves |
|---|---|
| `moneyGate.test.js` | A DENIED/DISSENT decision **cannot** create a PayPal order — enforced in code, counted by a spy. |
| `paypalSandbox.live.mjs` | The consensus receipt hash **survives inside a real PayPal order's `custom_id`** and is retrievable for audit. |
| `smoke.sh` | The full web flow works end-to-end. |

The combination is the point: **the receipt is not a UI decoration — it is stamped into the payment record itself, and a test proves it round-trips.**
