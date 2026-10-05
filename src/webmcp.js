/**
 * TRIAD — WebMCP Tool Registration
 *
 * Exposes TRIAD's adversarial adjudication + PayPal settlement as WebMCP tools,
 * so any WebMCP-capable AI agent (Chrome 146+) can invoke it from a web page.
 *
 * Tools registered:
 *   - triadAdjudicate      : run the 3-agent debate, return decision + dissent map
 *   - triadCreateOrder     : create a PayPal order for an APPROVED purchase
 *   - triadCaptureOrder    : capture (finalize) an approved order
 *   - triadGetLedger       : inspect all adjudications (transparency)
 *
 * The key idea: a website can let an agent *propose* a purchase, but the purchase
 * only settles if three independent agents reach consensus. Consensus is visible;
 * dissent is surfaced to the human.
 */

import { TriadRunner } from './runner.js';
import { adjudicate, DECISION, buildDissentMap } from './triad.js';
import { PayPalClient } from '../paypal/client.js';

/**
 * @param {object} deps
 *   { runner?: TriadRunner, paypal?: PayPalClient }
 */
export function createTriad({ runner, paypal } = {}) {
  const _runner = runner || new TriadRunner();
  const _paypal = paypal || PayPalClient.fromEnv();

  const ledger = [];       // every adjudication
  const pendingOrders = new Map(); // purchaseId -> { decision, order }

  async function triadAdjudicate({ amount, category, reason, monthlyBudget, spentThisMonth, recentPurchases } = {}) {
    const purchase = {
      id: `pur_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      amount: Number(amount) || 0,
      category: category || 'purchase',
      reason: reason || 'unspecified',
    };

    // Inject the human's stated constraints into ALL agents for this run
    // (the witness judges severity, so it needs the budget context too).
    const applyConstraints = (agent) => {
      if (monthlyBudget != null) agent.constraints.monthlyBudget = monthlyBudget;
      if (spentThisMonth != null) agent.constraints.spentThisMonth = spentThisMonth;
      if (recentPurchases) agent.constraints.recentPurchases = recentPurchases;
    };
    applyConstraints(_runner.agents.auditor);
    applyConstraints(_runner.agents.witness);
    applyConstraints(_runner.agents.advocate);

    const args = await _runner.debate(purchase);
    const result = adjudicate(purchase, args, 2);
    result.engine = args.engine;
    result.paypalMode = _paypal.mode;

    ledger.push({
      at: new Date().toISOString(),
      purchase: result.purchase,
      decision: result.decision,
      votesFor: result.votesFor,
      votesAgainst: result.votesAgainst,
      summary: result.dissentMap?.summary ?? 'consensus reached',
    });

    pendingOrders.set(result.purchase.id, { decision: result.decision, purchase: result.purchase });
    return result;
  }

  async function triadCreateOrder({ purchaseId, returnUrl, cancelUrl } = {}) {
    const entry = pendingOrders.get(purchaseId);
    if (!entry) return { ok: false, error: 'purchase_not_found' };
    if (entry.decision === DECISION.DENIED || entry.decision === DECISION.DISSENT) {
      return {
        ok: false,
        error: 'not_approved',
        decision: entry.decision,
        note: 'The three agents did not reach consensus. A human must override explicitly.',
      };
    }
    const order = await _paypal.createOrder(entry.purchase, { returnUrl, cancelUrl });
    entry.order = order;
    return {
      ok: true,
      decision: entry.decision,
      orderId: order.id,
      approvalLink: order.links?.find(l => l.rel === 'approve')?.href ?? null,
      mode: _paypal.mode,
    };
  }

  async function triadCaptureOrder({ orderId } = {}) {
    if (!orderId) return { ok: false, error: 'orderId_required' };
    const capture = await _paypal.captureOrder(orderId);
    return { ok: capture.status === 'COMPLETED', capture, mode: _paypal.mode };
  }

  function triadGetLedger() {
    return { count: ledger.length, entries: ledger };
  }

  return { triadAdjudicate, triadCreateOrder, triadCaptureOrder, triadGetLedger, _runner, _paypal, ledger };
}

/**
 * Register TRIAD as WebMCP tools on the current page.
 */
export function registerTriadWebMCP(triad = createTriad()) {
  if (typeof navigator === 'undefined' || !('modelContext' in navigator)) {
    console.warn('[TRIAD] navigator.modelContext unavailable (needs Chrome 146+ WebMCP flag)');
    return triad;
  }
  const mc = navigator.modelContext;

  mc.registerTool({
    name: 'triadAdjudicate',
    description:
      'Submit a purchase for adversarial adjudication by three independent AI agents (Advocate argues FOR, Auditor argues AGAINST, Witness judges). Returns a decision (APPROVED / CONDITIONAL / DENIED / DISSENT) and, on dissent, a map of who blocked what and why. No money moves here — this is the deliberative step.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Purchase amount in USD' },
        category: { type: 'string', description: 'What is being bought' },
        reason: { type: 'string', description: 'Why the user wants it' },
        monthlyBudget: { type: 'number', description: 'Optional: user-stated monthly budget' },
        spentThisMonth: { type: 'number', description: 'Optional: already spent this month' },
        recentPurchases: { type: 'array', items: { type: 'string' }, description: 'Optional: recent purchases' },
      },
      required: ['amount', 'category'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => triad.triadAdjudicate(input || {}),
  });

  mc.registerTool({
    name: 'triadCreateOrder',
    description:
      'Create a PayPal order for a purchase that TRIAD has APPROVED or CONDITIONALLY approved. Returns a PayPal approval link. Money does not move until triadCaptureOrder is called (human approval step).',
    inputSchema: {
      type: 'object',
      properties: {
        purchaseId: { type: 'string', description: 'purchaseId from triadAdjudicate' },
        returnUrl: { type: 'string' },
        cancelUrl: { type: 'string' },
      },
      required: ['purchaseId'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => triad.triadCreateOrder(input || {}),
  });

  mc.registerTool({
    name: 'triadCaptureOrder',
    description: 'Capture (finalize) an approved PayPal order. This is the human-approval step — call it only after the user has approved.',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => triad.triadCaptureOrder(input || {}),
  });

  mc.registerTool({
    name: 'triadGetLedger',
    description: 'Read-only: list every purchase adjudication TRIAD has made, with decision and vote counts.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => triad.triadGetLedger(),
  });

  console.log('[TRIAD] Registered 4 WebMCP tools: triadAdjudicate, triadCreateOrder, triadCaptureOrder, triadGetLedger');
  return triad;
}
