
// Security regression checks for the audit findings.
//
// Each case reproduces an attack the audit demonstrated and asserts the fixed
// behaviour. The modules under test are imported from the repository root, so
// this runs against the working tree and against a clean clone alike. No server
// is started, no network is used, and credentials are forced empty so the PayPal
// client stays in MOCK mode and the runner stays deterministic.
//
// Usage: node tests/security-regressions.mjs [repo-root]
import { pathToFileURL } from 'node:url';

import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
const T = process.argv[2] || resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PAYPAL_CLIENT_ID = '';       // force MOCK
process.env.PAYPAL_CLIENT_SECRET = '';
process.env.OLLAMA_API_KEY = '';         // force deterministic runner

const { createTriad } = await import(pathToFileURL(T + '/src/webmcp.js').href);
const { DECISION, adjudicate } = await import(pathToFileURL(T + '/src/triad.js').href);
const { TriadRunner } = await import(pathToFileURL(T + '/src/runner.js').href);

const out = [];
function check(name, ok, detail) {
  out.push({ name, ok, detail });
}

// ---------------------------------------------------------------------------
// A) capture binding: an orderId this process never created must be refused
// ---------------------------------------------------------------------------
{
  const triad = createTriad({ paypal: null, runner: new TriadRunner({ live: false }) });
  const r = await triad.triadCaptureOrder({ orderId: 'FOREIGN-ORDER-FROM-SOMEWHERE-ELSE' });
  check('A1 foreign orderId refused', r.ok === false && r.error === 'order_not_found', r.error || JSON.stringify(r).slice(0,80));
}

// ---------------------------------------------------------------------------
// B) verdict absent must NOT count as approval
// ---------------------------------------------------------------------------
{
  const runner = new TriadRunner({ live: false });
  const agent = runner.agents?.advocate || { role: 'advocate', title: 'Advocate', stance: 'for', model: 'x' };
  const p = { amount: 42, category: 'skincare', reason: 'test' };
  const noVerdict = runner._parse(agent, JSON.stringify({ reasons: ['no verdict field here'] }), p);
  check('B1 missing verdict is neutral, not for', noVerdict.verdict === 'neutral', 'got=' + noVerdict.verdict);
}

// ---------------------------------------------------------------------------
// C) conditions must be a bounded string
// ---------------------------------------------------------------------------
{
  const runner = new TriadRunner({ live: false });
  const agent = runner.agents?.witness || { role: 'witness', title: 'Witness', stance: 'neutral', model: 'x' };
  const p = { amount: 42, category: 'skincare', reason: 'test' };
  const obj = runner._parse(agent, JSON.stringify({ verdict: 'neutral', conditions: { evil: '<img src=x onerror=alert(1)>' } }), p);
  check('C1 object conditions rejected', obj.conditions === null, 'got=' + JSON.stringify(obj.conditions));
  const long = runner._parse(agent, JSON.stringify({ verdict: 'neutral', conditions: 'x'.repeat(1000) }), p);
  check('C2 long conditions capped at 240', typeof long.conditions === 'string' && long.conditions.length === 240, 'len=' + (long.conditions ? long.conditions.length : 'null'));
}

// ---------------------------------------------------------------------------
// D) a failed gate must outrank the votes
// ---------------------------------------------------------------------------
{
  const gateFail = {
    advocate: { verdict: 'for', gates: [], conditions: null },
    auditor:   { verdict: 'against', gates: [{ id: 'G2_over_budget', pass: false }], conditions: null },
    witness:   { verdict: 'for', gates: [], conditions: null },
  };
  // $999 against any budget: the gate fails, so the two approving votes must not win.
  const r = adjudicate({ amount: 999, category: 'x', reason: 'y' }, gateFail, 2);
  check('D1 failed gate beats 2 votes', r.decision === DECISION.DENIED, 'got=' + r.decision + ' votesFor=' + r.votesFor + ' failed=' + JSON.stringify(r.failedGates));

  // CONDITIONAL must not pre-empt a gate failure either
  const gateFailCond = {
    advocate: { verdict: 'for', gates: [], conditions: null },
    auditor:   { verdict: 'against', gates: [{ id: 'G3_share', pass: false }], conditions: null },
    witness:   { verdict: 'neutral', gates: [], conditions: 'pay in two parts' },
  };
  const r2 = adjudicate({ amount: 999, category: 'x', reason: 'y' }, gateFailCond, 2);
  check('D2 failed gate beats CONDITIONAL condition', r2.decision === DECISION.DENIED, 'got=' + r2.decision);

  // A clean run must still approve, so the gate does not just block everything
  const clean = {
    advocate: { verdict: 'for', gates: [], conditions: null },
    auditor:   { verdict: 'for', gates: [{ id: 'G2_over_budget', pass: true }], conditions: null },
    witness:   { verdict: 'for', gates: [], conditions: null },
  };
  const r3 = adjudicate({ amount: 42, category: 'x', reason: 'y' }, clean, 2);
  check('D3 clean run still approves', r3.decision === DECISION.APPROVED, 'got=' + r3.decision);
}

// ---------------------------------------------------------------------------
// E) MOCK capture must not report success
// ---------------------------------------------------------------------------
{
  const triad = createTriad({ runner: new TriadRunner({ live: false }) });
  // $20 of a $60 budget clears every gate: G3 wants amount <= half the budget
  // ($30) and G5 wants 2x the amount to fit what remains ($40 <= $60). The $42
  // this harness used before is a genuine gate violation, so it is DENIED after
  // the fix and never reaches the order step -- correct behaviour, wrong fixture.
  const adj = await triad.triadAdjudicate({ amount: 20, category: 'skincare', reason: 'renewal', monthlyBudget: 60, spentThisMonth: 0 });
  const ord = await triad.triadCreateOrder({ purchaseId: adj.purchase.id });
  if (ord.ok) {
    const cap = await triad.triadCaptureOrder({ orderId: ord.orderId, purchaseId: adj.purchase.id });
    check('E1 MOCK capture not reported as proof', cap.ok === false && cap.error === 'mock_capture_not_proof', 'error=' + (cap.error || 'none') + ' mode=' + cap.mode);
    const cap2 = await triad.triadCaptureOrder({ orderId: ord.orderId, purchaseId: adj.purchase.id });
    check('E2 second capture refused (consumption)', cap2.ok === false, 'error=' + (cap2.error || 'none'));
  } else {
    check('E1 MOCK capture not reported as proof', false, 'order not created: ' + (ord.error || '?') + ' decision=' + adj.decision);
    check('E2 second capture refused (consumption)', false, 'skipped');
  }
}

// ---------------------------------------------------------------------------
// F) The receipt is a pure function of its inputs
//
// verifyReceipt only means something if the same core always hashes the same.
// `at` is legitimately part of the proof -- a receipt is a timestamped
// assertion, so two purchases at different moments must not share a hash --
// which is why this pins `at` instead of comparing live runs.
// ---------------------------------------------------------------------------
{
  const { buildReceipt, verifyReceipt } = await import(pathToFileURL(T + '/src/receipt.js').href);
  const result = {
    decision: 'APPROVED',
    threshold: 2,
    purchase: { id: 'pur_1', amount: 20, category: 'skincare' },
    arguments: {
      advocate: { verdict: 'for', model: 'm1', reasons: ['a'] },
      auditor: { verdict: 'for', model: 'm2', reasons: ['b'] },
      witness: { verdict: 'for', model: 'm3', reasons: ['c'] },
    },
  };
  const FIXED = '2026-10-20T00:00:00.000Z';
  const hashes = new Set();
  for (let i = 0; i < 20; i++) hashes.add(buildReceipt(result, { at: FIXED }).hash);
  check('F1 receipt hash is deterministic (20 runs)', hashes.size === 1, 'distinct=' + hashes.size);

  const genuine = buildReceipt(result, { at: FIXED });
  check('F2 genuine receipt verifies', verifyReceipt(genuine) === true, 'got=' + verifyReceipt(genuine));
  check('F3 forged decision rejected', verifyReceipt({ ...genuine, decision: 'DENIED' }) === false, 'accepted a forged decision');

  const later = buildReceipt(result, { at: '2026-10-20T00:00:01.000Z' });
  check('F4 a later timestamp yields a new hash', later.hash !== genuine.hash, 'hashes collided across timestamps');
}

console.log(JSON.stringify(out, null, 1));
const failed = out.filter(o => !o.ok);
console.log(failed.length ? `\nFAILED ${failed.length}/${out.length}` : `\nALL ${out.length} CHECKS PASSED`);
process.exit(failed.length ? 1 : 0);
