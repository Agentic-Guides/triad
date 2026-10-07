
import { createTriad } from "./src/webmcp.js";
const t = createTriad();
const r = await t.triadAdjudicate({
  amount: 9.99, category: "Laundry Detergent (subscription renewal)",
  reason: "Anna's soap shop: monthly supply order, payment failed Wednesday",
  monthlyBudget: 60, spentThisMonth: 12,
});
console.log("=== 各エージェントの生の判定 ===");
for (const k of ["advocate","auditor","witness"]) {
  const a = r.arguments[k];
  console.log(`[${k}] verdict=${a.verdict} conditions=${JSON.stringify(a.conditions)} conf=${a.confidence}`);
}
console.log("\nvotesFor:", r.votesFor, "votesAgainst:", r.votesAgainst);
console.log("DECISION:", r.decision);
console.log("witness.conditions != null ?", r.arguments.witness?.conditions != null);
