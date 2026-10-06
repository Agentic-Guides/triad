# TRIAD × Cloudflare Birthday Week 2026 — 審査5項目を上げる具体設計

作成: 2026-10-06 / 締切: 2026-11-13 07:00 JST (残38日)
一次情報: Cloudflare Birthday Week 2026 wrap-up（46発表）/ Devpost 公式ルール全文 / TRIAD 実コード読解

---

## 0. 前提の確定（実測）

**審査の構造（Devpost rules §6 原文）**
- Stage One = **pass/fail**: 「reasonably fits the theme」＋「reasonably applies the required APIs/SDKs」。TRIAD は PayPal Orders v2 REST を直接叩いており通過済み。
- Stage Two = **5項目等加重**: Technological Implementation / Design / Potential Impact / Innovation・Idea / Presentation。
- 賞の排他制約（§8 原文）: 「**one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize**」。
  → **Grand を狙うならスポンサー賞は1枠だけ取れる**。TRIAD は既に Channel3 + WebMCP + PayPal を使っており、AG Grid を足すと「スポンサー賞1枠」のどれを取るかの選択になる。**AG Grid 1st $5,000 が本線、Channel3 $1,500 は保険**。

**Cloudflare Birthday Week 2026 = 16歳。46発表。** 以下すべて実測で存在を確認済み。

**無料枠の生死（重要）**
- ❌ **K2 は Workers Paid 必須**（docs 原文: "K2 is not available on the Workers Free plan"）→ **採用不可**（無料枠厳守制約）
- ❌ **Containers** も有料枠 → 採用不可
- ✅ Workers / D1 / R2 / KV / Durable Objects / AI Search(Free tier) / Browser Run / Workers AI / AI Gateway / Queues / Observability(Free: 0.5GB/day) → 無料枠で可
- ⚠️ **AI Search は 2026-11-01 から課金開始**。Free monthly allotment は残る（5M ingestion tokens / semantic 1,000 + full-text 1,000 queries/月）。**デモ用途なら無料枠内に収まる**が、11/1 以降に本番デモを回すなら query 数を抑える設計にする。

---

## 1. Technological Implementation を上げる発表 → 採用する API（ファイル名レベル）

現状 8/10 だが「PayPal を REST 直叩き + ローカル in-memory ledger」で止まっている。**「合意の監査証跡がプロセス再起動で消える」**のが最大の弱点（`src/webmcp.js` の `const ledger = []` と `pendingOrders = new Map()` はメモリのみ）。ここを潰すだけで Technological Implementation は明確に上がる。

### 1-A. 採用する発表と実装ファイル

| Birthday Week 2026 発表 | 実装するファイル | 使う API / 機能（具体的に） |
|---|---|---|
| **Workers KV Instant**（Quicksilver, p99 <2ms, 300+ locations） | `workers/triad-ledger/src/kv.js`（新規） | `env.TRIAD_LEDGER_KV.put(key, json)` / `.get(key, "json")`。`cacheTtl` は**書かない**（Instant モードは書込が即時グローバル伝播するのが売り。旧KVの eventually-consistent 説明は Instant では当てはまらない）。receipt hash をキーにする: `triad1:<hash>` |
| **AI Search GA**（native image embedding, OCR, 10MiB PDF） | `workers/triad-dispute-search/src/index.ts`（新規） | `env.AI_SEARCH.search({ query, ai_search_options: { instance_ids: [...], retrieval:{max_num_results:10}, reranking:{enabled:true} } })`。`wrangler.jsonc` に `"ai_search_namespaces": [{ "binding": "AI_SEARCH", "namespace": "triad-dispute" }]` |
| **Cloudflare Traces / 8 Observability updates**（open beta） | `workers/triad-ledger/src/trace.js`（新規）+ `wrangler.jsonc` | Workers の `observability.enabled = true` ＋ `traces` の sampling。**Ray ID を receipt に焼き込む**: `request.cf.rayId` を `src/receipt.js` の `core` に追加 → 「この決済を生んだリクエスト」を Cloudflare Traces で end-to-end 追跡可能にする |
| **Unified SQL API for observability**（beta, Workers native binding） | `workers/triad-analytics/src/index.ts` | `env.ANALYTICS_SQL.query(...)` で adjudication ログを横断クエリ。**Receipt は ledger に、メトリクスは Analytics Engine に分離** |
| **Workers ML-KEM / ML-DSA**（post-quantum Web Crypto） | `src/receipt.js` を改修 | `crypto.subtle.generateKey({name:"ML-DSA-65"}, ...)` / `sign` で receipt を**署名**。現状は SHA-256 ハッシュ＝改ざん検知のみ（第三者が「本物の TRIAD が発行した」検証はできない）。**ML-DSA 署名を足すと「改ざん不能」→「なりすまし不能」へ格上げ**。ここは Innovation にも効く |
| **cf CLI**（agentic CLI for entire Cloudflare API） | `scripts/deploy.sh` / README の再現手順 | `cf` で K2/AI Search/D1 を宣言的に構築。審査員が `cf` 一発で再現できる「非自明な実装」の証明になる |
| **Render Free**（スポンサー） | `render.yaml`（新規）で既存 `demo/server.mjs` をデプロイ | Web Service / Free plan / `PORT` env。デモを**審査員がURLを開くだけで試せる**状態に |

**★ 最重要の Technological Implementation 変更（これが本線）**

現在 `src/webmcp.js`:
```js
const ledger = [];                 // ← プロセス死で消える
const pendingOrders = new Map();   // ← 同上
```
これだと "money gate" の判定が **再起動を跨ぐと効かない**。改善:
```
workers/triad-ledger/src/ledger.js     — D1 (adjudications テーブル) + KV Instant (hot read) の二層
workers/triad-ledger/src/gate.ts       — not_approved 判定を D1 から引く（in-memory Map をやめる）
workers/triad-ledger/src/receipt.ts    — receipt.js の Workers 版。node:crypto → Web Crypto へ移植
                                        (createHash は Workers で使えない。crypto.subtle.digest('SHA-256', ...) に置換必須)
```
D1 スキーマ（`workers/triad-ledger/schema.sql`）:
```sql
CREATE TABLE adjudications (
  purchase_id TEXT PRIMARY KEY,
  custom_id   TEXT NOT NULL,          -- triad1:<hash>
  decision    TEXT NOT NULL CHECK (decision IN ('APPROVED','CONDITIONAL','DENIED','DISSENT')),
  votes_for   INTEGER NOT NULL,
  votes_against INTEGER NOT NULL,
  receipt_json TEXT NOT NULL,
  ray_id      TEXT,
  at          TEXT NOT NULL
);
CREATE INDEX idx_custom ON adjudications(custom_id);
```
→ **DENIED の purchase_id が D1 に残るので、プロセスを跨いでも order を物理的に作れない**。既存テスト `tests/moneyGate.test.js` の「DENIED→not_approved」が **Worker 経由でも通る**ことを追加テストにする。これが審査員に刺さる「working, non-trivial implementation」。

### 1-B. 採用しない（無料枠制約 or ROI 低）
- **K2**（Workers Paid 必須）、**Containers**（有料枠）、**Cloudflare OS**（managed, 営業案件）
- **Pay Per Use / Monetization Gateway x402**（HTTP 402）: これは **Innovation 用に採用する**（後述 §2）。技術スタックとしては PayPal が主で、x402 は「将来の対立の値付け」の構想として動くデモに1画面だけ入れる。

---

## 2. Design / Presentation を上げる発表（現状 Design 4 / Presentation 5 が最大の弱点）

### 2-A. Design（4 → 7+）: 「AG Grid = Dissent Map の実行時の見た目」に昇格

**TRIAD の本質は「対立の形を人間に見せる」**。ところが現状の UI は `demo/index.html` の素朴なカード表示。ここが Design 4 の原因。

**AG Grid スポンサー賞 $5,000 と Design スコアを同時に取る唯一の設計:**

| 画面 | 使う AG Grid 製品 | Cloudflare Birthday Week の担当 |
|---|---|---|
| **Consensus Ledger**（全 adjudication の一覧・フィルタ・ソート） | AG Grid Community の Grid | **D1** から `/api/ledger` を引く。列: purchase_id / decision / votes / custom_id / ray_id |
| **Dissent Map**（3エージェント × 争点 のマトリクス） | AG Grid の **Row Grouping** + **Cell Renderer**（賛否を色） | **AI Search** で類似の過去 DISSENT を引いて「過去に同じ争点で割れた例」を横に並べる |
| **Audit Trail Viewer**（custom_id → receipt → 推論本文） | AG Grid **Master/Detail** | **KV Instant** から custom_id で即引き（p99<2msが体感に出る） |
| **Cost vs Risk**（予算消費の時系列） | AG Grid **Sparkline / Integrated Charts** | **Basin SQL** or Analytics Engine から集計 |

`demo/index.html` を `demo/ag-grid/` に作り替え、`src/commerce.js` の `triadShop` の結果をそのままグリッドに流す。
**「AG Grid を"使った"から"審査員が一目で分かる"へ」** — AG Grid 審査員（同社が直接審査）はここを見る。

### 2-B. Presentation（5 → 7+）: 3分動画の構成を Cloudflare で撮る

**Kitesurf / Browser Run は「動画の素材製造」に使う（製品に入れる必要なし）**:
- `blog.cloudflare.com/kitesurf-update/` 実測: WebMCP support 追加、Web Platform subtest 230k→730k、**terminal-based rendering**、Browser Run API coverage 拡大（CDP/Playwright/Puppeteer）。
- 使い方①: **Kitesurf を CDP 経由で回して、Dissent Map が出る瞬間のスクリーンキャプチャを自動生成**
  ```bash
  # Kitesurf の devtools エンドポイント（flaviocopes.com の実測例）
  npx -y chrome-devtools-mcp@latest \
    --wsEndpoint=wss://api.cloudflare.com/client/v4/accounts/<ACCT>/browser-run/devtools/browser?browser=kitesurf
  ```
- 使い方②: **AI Search GA の `--parse-type discover` で、TRIAD の docs/ を自動クロールさせ、`/mcp` エンドポイントを公開** → 動画で「審査員が自分の Claude から TRIAD の意思決定を検索できる」デモを見せる。
  ```bash
  npx wrangler ai-search create triad-dispute \
    --namespace triad-dispute \
    --source https://<triad-domain> \
    --type web-crawler --parse-type discover
  ```
- **Observability/Cloudflare Traces を動画に出す**: `cf` で Worker の trace を1本引き、`payment → adjudication → PayPal order` が1本の trace に見える画を撮る。審査員（Cloudflare ではなく PayPal 主軸だが、Technological Implementation で効く）に「運用可能な実装」を示せる。

### 2-C. Innovation（6 → 8）: x402 で「対立そのものを値付けする」

**再定義（既に3人の分析で合意済み）**: 「3体議論」は既出 → **「対立を改ざん不能な監査証跡として PayPal order の custom_id に刻む」** に転換。さらに Birthday Week 2026 の **Monetization Gateway beta（HTTP 402 + x402）** を重ねて:

> **TRIAD は「合意」を売る。だが合意できない時は「対立」を売る。**
> 割れた DISSENT を x402 (HTTP 402) で有料化し、人間の意思決定者が購入する。
> `Dissent Map` を `402 Payment Required` の背後に置き、x402 で払った人間だけが「なぜ3体が割れたか」の全文を読める。

**この一手で「既存概念との差」が3層になる**:
1. 3体議論（既出）
2. 対立の監査証跡を custom_id に刻む（独自）
3. **対立の閲覧権を x402 で値付けする**（Birthday Week 2026 の新発表を最速で使う = Innovation 審査員に刺さる）

実装: `workers/triad-x402/src/index.ts`。Cloudflare の x402 実装（`blog.cloudflare.com/monetization-gateway-beta/`）+ PayPal が主役で、x402 は「対立の値付け」レイヤ。**PayPal を central に保ちながら Innovation を足す**（rules §4-2 の "PayPal integration is central" を崩さない）。

---

## 3. ボスの既存資産を最大限活用する構成（全体図）

```
┌─ Render Free ─────────────────────────────────────────────┐
│  demo/server.mjs (既存・そのまま)                          │
│  ├ demo/ag-grid/  ← AG Grid UI (Design を作る)             │
│  └ PayPal Orders v2 REST (sandbox, src/paypal/client.js)   │
│      ↑ /api/adjudicate /api/shop /api/order /api/verify     │
└───────────────┬───────────────────────────────────────────┘
                │ fetch (WebMCP tools / REST)
┌───────────────▼─── Cloudflare Workers (Free) ──────────────┐
│  wrangler.jsonc                                            │
│  ├ workers/triad-ledger/   ← D1 + KV Instant  (監査証跡の真実) │
│  │     schema.sql → D1 binding "TRIAD_DB"                  │
│  │     kv.js → KV binding "TRIAD_LEDGER_KV"                │
│  ├ workers/triad-dispute-search/ ← AI Search MCP           │
│  │     "ai_search_namespaces": [{binding:"AI_SEARCH"}]     │
│  ├ workers/triad-x402/     ← Monetization Gateway (402)   │
│  ├ workers/triad-webhook/  ← PayPal webhook 受信           │
│  │     PAYMENT.CAPTURE.COMPLETED → D1 に capture 記録      │
│  │     Ray ID を receipt に焼き込む                         │
│  └ observability.enabled = true（Traces / Logs）           │
│      R2 binding "TRIAD_ARCHIVE" ← 推論本文の全文保存        │
└────────────────────────────────────────────────────────────┘
```

**役割分担（既存資産の使い所）**
- **Workers**: 意思決定の**改ざん不能な記録層**。ローカル ledger を D1 に移す。**ここが審査の Technological Implementation の芯**。
- **D1**: `adjudications` テーブル = 真実の源。再起動耐性 = money gate の永続化。
- **KV Instant**: `triad1:<hash>` → receipt JSON。**p99 <2ms を「検証が一瞬で返る」UX に変換**（Audit Trail Viewer が体感で速い）。
- **R2**: 3エージェントの推論**全文**を `r2://triad-archive/<purchase_id>/{advocate,auditor,witness}.md` に保存。receipt には**指紋だけ**を刻む設計（現状維持）＝「receipt は軽い、本文は R2」の分離が美しい。
- **Browser Run / Kitesurf**: **動画素材の自動生成**（製品機能ではなく Presentation 用）。CDP 経由で Dissent Map の瞬間をキャプチャ。
- **AI Search**: ①`/mcp` 公開（審査員が自分のエージェントから TRIAD を検索）②Dissent Map 画面で「過去の類似 DISSENT」を横引き。
- **Observability / Traces**: Ray ID で `PayPal order → adjudication → 3 LLM calls` を1本の trace にする。**「監査可能」の説得力を可視化**。

**既存コードからの最小改修マップ（ファイル単位）**

| 既存 | 改修 | 理由 |
|---|---|---|
| `src/triad.js` | そのまま（合意エンジンは完成度高い） | — |
| `src/receipt.js` | `node:crypto` → Web Crypto、`ray_id` 追加、ML-DSA 署名フィールド追加 | Workers で動かす & 格上げ |
| `src/webmcp.js` | `const ledger = []` を D1 読み書きへ差し替え、`not_approved` 判定を D1 から | money gate の永続化 |
| `paypal/client.js` | `createOrder` に `payment_source` / `custom_id` 維持。webhook 検証追加 | PayPal 整合 |
| `src/commerce.js` | 変更なし（Channel3 adapter はそのまま） | Channel3 $1,500 の担保 |
| `demo/server.mjs` | `render.yaml` 追加。`/api/ledger` を Workers にプロキシ | Render デプロイ |
| `demo/index.html` | `demo/ag-grid/` へ | Design |

---

## 4. スポンサー賞との併用 — Cloudflare をどこに置くか

**制約（§8 原文）: Grand 1 + Sponsor 1、または HM 1 + Sponsor 1。** つまり Cloudflare は「Grand を取るための Technological/Design の底上げ装置」であり、**スポンサー賞そのものではない**（Cloudflare はスポンサーではない）。よって:

| 賞 | Cloudflare の貢献 | 実装 |
|---|---|---|
| **AG Grid 1st $5,000**（最優先） | 「AG Grid を使った」ではなく「AG Grid が無いと対立地図が成立しない」状態を作る。データ供給を D1/KV Instant が担う | §2-A のグリッド群 |
| **Channel3 $1,500**（保険） | 既存 `src/channel3.js` + `src/commerce.js` が生きている。**Advocate が"本物の商品"を論じる根拠が Channel3** | 変更なし。審査員に「Channel3 が無いと何も議論できない」と示す |
| **APIMatic $1,000×3** | **Cloudflare Forge（Birthday Week 発表）が SDK 生成パイプライン**。TRIAD の REST API から APIMatic/Forge で SDK 生成 → 「API が product として整っている」証明 | `openapi.yaml` + Forge で `sdk/` 生成 |
| **Render credits** | デモのホスト先（§5） | `render.yaml` |

**Cloudflare の最適な置き方: 「審査員に見えない場所（記録層・監査層）」に置く。**
- 見せ場（グリッド、動画、PayPal 決済）は **Render + AG Grid + PayPal**。
- 信頼の担保（改ざん不能・トレース・監査）は **Cloudflare**。
- これを3分動画のラスト30秒で「この決済の監査証跡は Cloudflare に刻まれている」と見せる。**Technological Implementation の加点と、AG Grid 審査員の満足を両立**。

⚠️ **AG Grid 審査員は AG Grid の"使い込み度"を直接採点する。** Community 版の素のグリッドだけでは弱い。**Row Grouping + Master/Detail + Integrated Charts** まで使う（§2-A）。トライアルは **11/1-11/3** に投入（締切前に失効するため、ライセンスは締切後の審査期間をカバーする必要はない）。

---

## 5. デモのホスト先 — 確定: **両方（Render Free = 主、Cloudflare Workers + D1 = 記録層）**

**結論: ハイブリッド。ただし"主"は Render。動画で開く URL は Render の1本。**

| | Render Free | Cloudflare Workers + D1 |
|---|---|---|
| 役割 | **審査員が開くデモ本体**（`demo/server.mjs` + AG Grid UI） | **監査証跡・money gate・webhook の永続層** |
| 理由 | rules §4「Provide access to a functional demo」。**URL 1本で試せる**のが最強。無料枠あり、`render.yaml` で宣言的 | ローカル in-memory ledger の欠陥を消す。**審査員には見えないが Technological Implementation の芯** |
| 設定 | `render.yaml`（Web Service / Free / `PORT`） | `wrangler.jsonc`（D1 binding `TRIAD_DB`, KV `TRIAD_LEDGER_KV`, R2 `TRIAD_ARCHIVE`） |
| 注意 | Free はスリープする → **動画は暖機後に撮る**。README に「初回アクセスは30秒待つ」と明記 | AI Search は 11/1 課金開始 → Free allotment 内。K2 は Paid 必須なので**使わない** |

**なぜ「両方」か**: どちらか一方だと負ける。
- Render だけ → ledger が消える（money gate が弱い = Technological Implementation が伸びない）
- Workers だけ → 審査員が開くデモが貧弱（Design/Presentation が伸びない）
- ハイブリッド → §4 の「見せ場は Render、信頼は Cloudflare」が成立。

---

## 6. 38日・週11-20h（約60-110h）で【何をやめて何に集中するか】

### ❌ やめる（中止・後回し確定）
1. **K2 の採用** — Workers Paid 必須。無料枠制約に反する。**永久に中止**。
2. **Containers / Cloudflare OS** — 有料枠 or 営業案件。
3. **Basin Pipelines/Catalog/SQL の本番導入** — GA だがデータ基盤は今回の審査項目に直結しない。**動画の1カット（Cost vs Risk チャートの供給元）に留める**。それ以上はやめる。
4. **x402 Monetization Gateway の"本番決済"** — beta。**Innovation 用の1画面デモに限定**。x402 の清算実装に時間を溶かさない。
5. **新規LLMプロバイダ対応・モデル比較** — `src/runner.js` は完成。触らない。
6. **WebMCP を Chrome 146+ フラグ前提の生デモに依存させる** — 審査員環境で動かないリスク。**WebMCP は"実装済み"として README で示し、デモの主経路は REST（`demo/server.mjs`）にする**。

### ✅ 集中する（この順番）
| 週 | 期間 | やること | 完了条件 |
|---|---|---|---|
| W1 | 10/6-10/12 | `workers/triad-ledger/` 作成。`receipt.js` を Web Crypto 移植 → `workers/.../receipt.ts`。D1 `schema.sql` 適用。money gate を D1 化 | `wrangler d1 execute` 成功 + DENIED が Worker 経由でも `not_approved` |
| W2 | 10/13-10/19 | KV Instant で receipt hot read。R2 に推論全文保存。`ray_id` を receipt に焼く | `triadVerifyReceipt` が custom_id 照合で ok:true |
| W3 | 10/20-10/26 | **`demo/ag-grid/` 全面書き換え**（Row Grouping / Master-Detail / Charts）。Design を 7 へ | 審査員が URL で全グリッドを操作できる |
| W4 | 10/27-11/2 | **AG Grid トライアル投入（11/1-11/3）**。`render.yaml` デプロイ。AI Search `/mcp` 公開。x402 1画面 | Render URL が外部から開ける |
| W5 | 11/3-11/9 | **3分動画撮影**（Kitesurf CDP で素材生成、Traces で監査の画）。README 英語化・repro手順 | YouTube 公開済み・非公開リポ→公開 |
| W6 | 11/10-11/12 | 提出物最終化。**11/12 14:00 PST = 11/13 07:00 JST 厳守**。バッファ | Devpost 提出完了 |

### 🎯 一点集中の原則
**「Technological Implementation を D1 永続化で固め、Design を AG Grid で作り、Innovation を x402 の1画面で足す。」**
- Presentation は**動画1本**に集中（Kitesurf/Browser Run は素材生成のみ）
- Potential Impact は「中小事業者の経費精算担当」に絞る（PayPal が "especially small businesses" と明言）
- **Cloudflare は"見えない信頼層"に置く** — ここを間違えると、Cloudflare の時間が Design と AG Grid を食う

### 残38日で「やらない」と決めた瞬間に浮く時間: 約25-35h
これを **AG Grid の UI 研磨（W3）と動画（W5）** に全振りする。この2つが現状スコア 4/5 の元凶。

---

## 付録: 実測ソース（一次情報）
- Birthday Week 2026 wrap-up（46発表）: https://blog.cloudflare.com/birthday-week-2026-wrap-up
- Kitesurf update: https://blog.cloudflare.com/kitesurf-update/ （WebMCP, 730k subtests, terminal rendering）
- AI Search GA: https://blog.cloudflare.com/ai-search-ga/ （11/1 課金開始, OCR, 10MiB, Qwen3-VL-Embedding）
- AI Search + MCP 実装例: https://blog.cloudflare.com/ai-search-easier （`ai_search_namespaces`, `env.AI_SEARCH.search`）
- Workers KV Instant: https://blog.cloudflare.com/workers-kv-instant （Quicksilver, p99<2ms）
- 8 Observability updates: https://blog.cloudflare.com/one-observability-platform （Traces open beta, unified SQL API, Analytics binding）
- Monetization Gateway x402: https://blog.cloudflare.com/monetization-gateway-beta/
- K2: https://blog.cloudflare.com/cloudflare-k2-streams/ ＋ docs（**Workers Paid 必須**）
- Basin GA: https://blog.cloudflare.com/cloudflare-basin
- cf CLI: https://blog.cloudflare.com/cloudflare-cf-cli-launch/
- Forge: https://blog.cloudflare.com/forge-open-source-generation-pipeline/
- Workers ML-KEM/ML-DSA: https://blog.cloudflare.com/workers-ml-kem-ml-dsa-support/
- Devpost 公式ルール: https://paypalaihackathon.devpost.com/rules （§6 5項目等加重 / §8 賞と排他制約）
