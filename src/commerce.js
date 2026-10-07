/**
 * Tuesday + Channel3 integration.
 *
 * Flow: user names a category → Channel3 returns real product candidates →
 * The Advocate argues for the best one, the Auditor checks it against the
 * budget, the Witness judges. This grounds the debate in real, purchasable SKUs.
 */

import { createTriad } from './webmcp.js';
import { Channel3 } from './channel3.js';
import { adjudicate, DECISION } from './triad.js';

export function createTriadCommerce({ triad, catalog } = {}) {
  const _triad = triad || createTriad();
  const _catalog = catalog || Channel3.fromEnv();

  /**
   * Full commerce flow:
   *   1. Find candidate products (Channel3)
   *   2. Adjudicate the top candidate (the tribunal)
   *   3. Optionally create a PayPal order
   */
  async function triadShop({ category, query, monthlyBudget, spentThisMonth, recentPurchases, maxPrice } = {}) {
    // 1. Candidate discovery (don't duplicate category into query)
    const candidates = await _catalog.search({ query: query || undefined, category, maxPrice, limit: 5 });
    if (!candidates.length) {
      return { ok: false, error: 'no_candidates', category };
    }

    // 2. Adjudicate each candidate; pick the best APPROVED/CONDITIONAL one.
    const results = [];
    for (const product of candidates.slice(0, 5)) {
      const r = await _triad.triadAdjudicate({
        amount: product.price,
        category: product.title,
        reason: `Best match for "${category}": ${product.brand} ${product.title} (★${product.rating})`,
        monthlyBudget,
        spentThisMonth,
        recentPurchases,
      });
      results.push({ product, decision: r.decision, adjudication: r });
      if (r.decision === DECISION.APPROVED) break; // stop at first clean approval
    }

    const approved = results.find(r => r.decision === DECISION.APPROVED)
      || results.find(r => r.decision === DECISION.CONDITIONAL)
      || null;

    return {
      ok: Boolean(approved),
      category,
      candidates: candidates.length,
      evaluated: results.length,
      catalogMode: _catalog.mode,
      recommendation: approved
        ? { product: approved.product, decision: approved.decision, purchaseId: approved.adjudication.purchase.id }
        : null,
      allResults: results.map(r => ({
        title: r.product.title,
        brand: r.product.brand,
        price: r.product.price,
        rating: r.product.rating,
        decision: r.decision,
      })),
      message: approved
        ? `Consensus on "${approved.product.title}" (${approved.decision}).`
        : 'No candidate reached consensus. Widen the budget or narrow the requirements.',
    };
  }

  return { triadShop, _triad, _catalog };
}

/** Register commerce tools on WebMCP. */
export function registerTriadCommerceWebMCP(commerce = createTriadCommerce()) {
  if (typeof navigator === 'undefined' || !('modelContext' in navigator)) {
    console.warn('[Commerce] navigator.modelContext unavailable');
    return commerce;
  }
  const mc = navigator.modelContext;

  mc.registerTool({
    name: 'triadShop',
    description:
      'Shop for a real product in a category. Channel3 finds candidate products from a 50M+ catalog, then three independent AI agents (Advocate/Auditor/Witness) adjudicate each candidate against the budget. Returns the consensus recommendation, or explains why nothing was approved. No money moves here.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'e.g. headphones, laptop, office chair, watches, cameras' },
        query: { type: 'string', description: 'Optional free-text product query' },
        maxPrice: { type: 'number', description: 'Optional max price filter' },
        monthlyBudget: { type: 'number' },
        spentThisMonth: { type: 'number' },
        recentPurchases: { type: 'array', items: { type: 'string' } },
      },
      required: ['category'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => commerce.triadShop(input || {}),
  });

  console.log('[Commerce] Registered WebMCP tool: triadShop');
  return commerce;
}
