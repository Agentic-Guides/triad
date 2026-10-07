/**
 * Tuesday — WebMCP Tool Registration
 *
 * Exposes the adversarial adjudication + PayPal settlement as WebMCP tools,
 * so any WebMCP-capable AI agent (Chrome 146+) can invoke it from a web page.
 *
 * Tools registered:
 *   - triadAdjudicate      : run the 3-agent debate, return decision + dissent map + receipt
 *   - triadCreateOrder     : create a PayPal order for an APPROVED purchase (stamps receipt hash)
 *   - triadCaptureOrder    : capture (finalize) an approved order
 *   - triadGetLedger       : inspect all adjudications (transparency)
 *   - triadVerifyReceipt   : verify the custom_id audit trail was not tampered with
 *
 * The key idea: a website can let an agent *propose* a purchase, but the purchase
 * only settles if three independent agents reach consensus. Consensus is visible;
 * dissent is surfaced to the human.
 */

import { TriadRunner } from './runner.js';
import { adjudicate, DECISION, buildDissentMap } from './triad.js';
import { PayPalClient } from '../paypal/client.js';
import { buildReceipt, receiptCustomId, verifyReceipt, hashFromCustomId } from './receipt.js';

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

    // ★ Consensus receipt — decision + all three votes + reasoning fingerprints,
    //   hashed into a tamper-evident audit record. This is what gets stamped
    //   into the PayPal order's custom_id, so the payment record IS the audit trail.
    const receipt = buildReceipt(result, { engine: args.engine });
    result.receipt = receipt;
    receipt.customId = receiptCustomId(receipt); // e.g. triad1:5f0cb4a5d19d7be3
    result.audit = {
      customId: receipt.customId,
      hash: receipt.hash,
      verify: verifyReceipt(receipt),
    };

    ledger.push({
      at: receipt.at,
      purchase: result.purchase,
      decision: result.decision,
      votesFor: result.votesFor,
      votesAgainst: result.votesAgainst,
      summary: result.dissentMap?.summary ?? 'consensus reached',
      receiptHash: receipt.hash,
      customId: receipt.customId,
      // ★ Rich audit fields for the AG Grid governance dashboard.
      //   Everything an auditor needs to reconstruct WHY this decision happened.
      votes: receipt.votes,                       // { advocate:'for', auditor:'against', witness:'neutral' }
      models: receipt.models,                     // { advocate:'deepseek...', auditor:'...', witness:'...' }
      engine: receipt.engine || args.engine,
      threshold: result.threshold,
      amount: result.purchase.amount,
      category: result.purchase.category,
      dissentMap: result.dissentMap ?? null,
      receiptIntact: verifyReceipt(receipt),
    });

    pendingOrders.set(result.purchase.id, {
      decision: result.decision,
      purchase: result.purchase,
      receipt,
    });
    return result;
  }

  async function triadCreateOrder({ purchaseId, returnUrl, cancelUrl } = {}) {
    const entry = pendingOrders.get(purchaseId);
    if (!entry) return { ok: false, error: 'purchase_not_found' };
    if (entry.decision === DECISION.DENIED || entry.decision === DECISION.DISSENT) {
      // ★ The money gate: a non-consensus adjudication cannot mint an order.
      return {
        ok: false,
        error: 'not_approved',
        decision: entry.decision,
        note: 'The three agents did not reach consensus. A human must override explicitly.',
      };
    }

    // ★ Stamp the consensus receipt hash into the PayPal order's custom_id.
    //   The order carries the audit trail with it: custom_id → triad ledger entry.
    const receipt = entry.receipt;
    const purchase = {
      ...entry.purchase,
      customId: receipt?.customId || entry.purchase.customId || entry.purchase.id,
    };
    const order = await _paypal.createOrder(purchase, { returnUrl, cancelUrl });
    entry.order = order;

    const orderCustomId =
      order.purchase_units?.[0]?.custom_id ?? purchase.customId;

    return {
      ok: true,
      decision: entry.decision,
      orderId: order.id,
      approvalLink: order.links?.find(l => l.rel === 'approve')?.href ?? null,
      mode: _paypal.mode,
      audit: receipt
        ? {
            hash: receipt.hash,
            customId: orderCustomId,
            stamped: orderCustomId === receipt.customId,
            verify: verifyReceipt(receipt),
          }
        : null,
    };
  }

  /**
   * 改ざん検知 — order の custom_id に刻んだ指紋が、ledger の receipt と一致するか。
   * PayPal から order を引き直し、custom_id を照合して監査証跡を検証する。
   */
  async function triadVerifyReceipt({ orderId, purchaseId } = {}) {
    let entry = purchaseId ? pendingOrders.get(purchaseId) : null;
    if (!entry && orderId) {
      entry = [...pendingOrders.values()].find((e) => e.order?.id === orderId) || null;
    }
    const receipt = entry?.receipt;
    if (!receipt) return { ok: false, error: 'receipt_not_found' };

    const customId = entry.order?.purchase_units?.[0]?.custom_id ?? receipt.customId;
    const onChain = hashFromCustomId(customId);
    const intact = verifyReceipt(receipt);
    return {
      ok: intact && onChain === receipt.hash,
      decision: entry.decision,
      customId,
      orderHash: onChain,
      ledgerHash: receipt.hash,
      hashMatches: onChain === receipt.hash,
      receiptIntact: intact,
      votes: receipt.votes,
      models: receipt.models,
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

  return {
    triadAdjudicate,
    triadCreateOrder,
    triadCaptureOrder,
    triadVerifyReceipt,
    triadGetLedger,
    _runner,
    _paypal,
    ledger,
    pendingOrders,
  };
}

/**
 * Register Tuesday as WebMCP tools on the current page.
 */
export function registerTriadWebMCP(triad = createTriad()) {
  if (typeof navigator === 'undefined' || !('modelContext' in navigator)) {
    console.warn('[Tuesday] navigator.modelContext unavailable (needs Chrome 146+ WebMCP flag)');
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
      'Create a PayPal order for a purchase the tribunal has APPROVED or CONDITIONALLY approved. Returns a PayPal approval link. Money does not move until triadCaptureOrder is called (human approval step).',
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
    description: 'Read-only: list every adjudication the tribunal has made, with decision, vote counts, and consensus receipt hash.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => triad.triadGetLedger(),
  });

  mc.registerTool({
    name: 'triadVerifyReceipt',
    description:
      'Read-only: verify the tamper-evident audit trail of an approved purchase. Re-hashes the consensus receipt and checks it matches the hash stamped into the PayPal order custom_id. Returns the three votes and the models that cast them. Use this to prove a payment record has not been altered.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'PayPal order id' },
        purchaseId: { type: 'string', description: 'Or the purchaseId from triadAdjudicate' },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => triad.triadVerifyReceipt(input || {}),
  });

  console.log('[Tuesday] Registered 5 WebMCP tools: triadAdjudicate, triadCreateOrder, triadCaptureOrder, triadGetLedger, triadVerifyReceipt');
  return triad;
}
