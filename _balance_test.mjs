
import { createTriad } from "./src/webmcp.js";
const t = createTriad();
const cases = [
  {label:"A: budget has room", amount:9.99, category:"Laundry Detergent (subscription renewal)",
   reason:"Anna's soap shop: monthly supply order, payment failed Wednesday", monthlyBudget:60, spentThisMonth:12},
  {label:"B: budget nearly full", amount:9.99, category:"Laundry Detergent (subscription renewal)",
   reason:"Anna's soap shop: monthly supply order, payment failed Wednesday", monthlyBudget:60, spentThisMonth:41},
  {label:"C: over budget", amount:99.00, category:"Luxury gift box",
   reason:"impulse buy", monthlyBudget:60, spentThisMonth:55},
];
for (const c of cases) {
  const r = await t.triadAdjudicate({amount:c.amount,category:c.category,reason:c.reason,monthlyBudget:c.monthlyBudget,spentThisMonth:c.spentThisMonth});
  const v = k => (r.arguments[k]||{}).verdict;
  console.log(`${c.label} | ${r.decision} | votes ${r.votesFor}f/${r.votesAgainst}a | A=${v("advocate")} B=${v("auditor")} W=${v("witness")} | ${r.receipt.customId}`);
}
