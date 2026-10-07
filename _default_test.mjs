
import { createTriad } from "./src/webmcp.js";
const t = createTriad();
console.log("LLM live:", t._runner.live);
console.log("agents:", Object.values(t._runner.agents).map(a=>a.role+"="+a.model).join(", "));
const r = await t.triadAdjudicate({
  amount: 9.99, category: "Laundry Detergent (subscription renewal)",
  reason: "Anna's soap shop: monthly supply order, payment failed Wednesday",
  monthlyBudget: 60, spentThisMonth: 41,
});
console.log("ENGINE:", r.engine, "| DECISION:", r.decision, "| votes:", r.votesFor+"for", r.votesAgainst+"against");
console.log("RECEIPT:", r.receipt.customId);
