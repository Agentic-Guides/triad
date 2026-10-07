// gpt-oss:120b が返す実際の形式でTRIADの_parseが動くか検証
const samples = [
  '{\n  "verdict": "against",\n  "reasons": ["a","b"],\n  "confidence": 0.9\n}',
  '```json\n{"verdict":"for","reasons":["x"],"confidence":0.8}\n```',
  '```\n{\n "verdict": "neutral",\n "reasons": ["..."],\n "conditions": null,\n "confidence": 0.4\n}\n```',
];
for (const raw of samples) {
  const m = raw.match(/\{[\s\S]*\}/);
  let parsed = null, verdict = "PARSE_FAIL";
  try {
    const j = JSON.parse(m ? m[0] : raw);
    parsed = j; verdict = j.verdict;
  } catch (e) { verdict = "THROW: " + e.message.slice(0,40); }
  console.log("raw head:", JSON.stringify(raw.slice(0,45)));
  console.log("  matched:", m ? "yes" : "no", "| verdict:", verdict);
}
