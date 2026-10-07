# 視点B：技術実装・最終 — PayPal公式MCP完全アーキテクチャ & 37日計画

実測日: 2026-10-07 / 対象: PayPal AI Hackathon（締切 JST 11/13 07:00）

---

## 技術的な結論（3行以内）

1. **技術では勝てる。** 既存TRIAD（`src/webmcp.js`・moneyGate 31 assertions全緑・`receipt.js`のcustom_id刻印）はそのまま土台になり、PayPal公式MCPの `create_subscription` / `cancel_subscription` / `create_recurring_series` を **1枚のアダプタ（`paypal/mcpClient.js`）で差し込むだけ**で「エージェントが代理でサブスクを処理する」実装が完成する。追加コードは推定 900〜1,200行。
2. **致命傷は技術ではなく「抽象性」と「依存の二重化」。** 敗因実測（WebMCP入賞なし）は名詞の不在。加えて `@paypal/mcp` は **stdio 1プロセス=1トークン** なので、商人側/顧客側の2トークン同時運用は「MCPサーバー2本を子プロセスで立てる」必要があり、ここを設計しないと demo が当日死ぬ。
3. **37日で動く。** Week1=骨格（Mock固定でE2E緑）、Week2=Live MCP接続、Week3=UI/動画、Week4=発表資料＋フリーズ。**11/10 にコードフリーズ、以後は録画と文書だけ**。

---

## 1. ★★MCP経由実装の完全アーキテクチャ（ファイル名・関数名で）

### 1-1. ディレクトリ（既存 `C:\Users\hohoh\Desktop\ht_projyekuto\triad` を拡張）

```
triad/
├─ paypal/
│  ├─ client.js            ★既存・残す（Orders v2 実測済 / MOCKフォールバック内蔵）
│  ├─ mcpClient.js         ★新規・MCPアダプタ（唯一のnpm依存境界）
│  ├─ mcpServers.json      ★新規・`npx @paypal/mcp` の起動定義（審査員が読む）
│  └─ subscriptions.js     ★新規・Subscriptions v1 の高レベル関数
├─ src/
│  ├─ triad.js             ★既存・残す（ROLES / makeAgent / adjudicate / DECISION）
│  ├─ runner.js            ★既存・残す（TriadRunner.debate）※サブスク用プロンプトを追加
│  ├─ receipt.js           ★既存・残す（buildReceipt / fingerprint / receiptCustomId）
│  ├─ webmcp.js            ★既存・残す＋サブスク4ツールを追記
│  ├─ commerce.js          ★既存・残す（triadShop）
│  ├─ subscriptionGate.js  ★新規・「課金失敗→代理判断」の要（§3）
│  ├─ agentLedger.js       ★新規・ledger/pendingOrders を分離（webmcp.js から抽出）
│  └─ mcpRegistry.js       ★新規・MCPサーバー2本のライフサイクル管理
├─ demo/
│  ├─ server.mjs           ★既存・残す（node標準のみ）
│  ├─ public/index.html    ★改修・both sides（商人/顧客）の2画面
│  └─ public/dashboard.js  ★新規・AG Grid 監査ダッシュボード（スポンサー賞）
├─ tests/
│  ├─ moneyGate.test.js    ★既存・残す（31 assertions 全緑の証明）
│  ├─ subscriptionGate.test.js     ★新規・ゲート不破壊の証明
│  ├─ mcp.mock.test.js             ★新規・キー無し完全E2E
│  └─ mcp.live.sandbox.mjs         ★新規・実サンドボックス（鍵がある時のみ）
└─ docs/
   ├─ MCP-ARCHITECTURE.md  ★新規・審査員向け図解
   └─ REPRODUCE.md         ★新規・`npm test` 3コマンドで再現
```

### 1-2. `paypal/mcpClient.js` — MCPアダプタ（★中核）

**設計方針：依存ゼロ方針と衝突しない。** 理由は次の通り（実測ベース）:

- `@paypal/mcp` は **`npx -y` で起動する別プロセス**。アプリ本体に `node_modules` として食い込まない。
- したがって「依存ゼロNode」は **アプリ本体では維持**され、npm依存は **`paypal/` ディレクトリの中だけ**に閉じる（境界が1ファイル）。
- ★未検証: MCPプロトコル（stdio JSON-RPC）を自前実装すれば `@modelcontextprotocol/sdk` も不要にできる可能性がある（実測では確認していない）。**初期はSDKを使い、時間が余れば自前化**。

```js
// paypal/mcpClient.js
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';          // ★唯一の「重い」依存
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const PAYPAL_MCP_VERSION = '1.8.1';

/** 審査員の再現性のため、ツール名は実測した18本から明示的に選択する（= は任意ではなく列挙） */
export const SUBSCRIPTION_TOOLS = [
  'create_product', 'create_subscription_plan', 'list_subscription_plans',
  'create_subscription', 'cancel_subscription',
  'create_recurring_series', 'activate_recurring_series',
  'cancel_recurring_series', 'get_recurring_series',
];
export const AUDIT_TOOLS = ['list_transactions', 'get_merchant_insights', 'create_refund'];

export class PayPalMCPClient {
  constructor({ accessToken, environment = 'sandbox', tools = [...SUBSCRIPTION_TOOLS, ...AUDIT_TOOLS], mock = false } = {}) {
    this.accessToken = accessToken;
    this.environment = environment;
    this.tools = tools;
    this.mock = mock || !accessToken;   // ★鍵が無ければ Mock に落ちる（審査員の再現性）
    this.client = null;
  }

  static fromEnv(env = process.env) {
    return new PayPalMCPClient({
      accessToken: env.PAYPAL_MCP_ACCESS_TOKEN,          // ★MCPはOAuthアクセストークン1つ
      environment: env.PAYPAL_ENVIRONMENT || 'sandbox',
    });
  }

  get mode() { return this.mock ? 'MOCK' : 'MCP'; }

  /** ★起動コマンドは pack で実測済みの形をそのまま使う（改変しない） */
  get command() {
    return ['-y', `@paypal/mcp@${PAYPAL_MCP_VERSION}`,
      `--access-token=${this.accessToken}`,
      `--paypal-environment=${this.environment}`,
      `--tools=${this.tools.join(',')}`].join(' ');
  }

  async connect() {
    if (this.mock) return this;
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', `@paypal/mcp@${PAYPAL_MCP_VERSION}`,
        `--access-token=${this.accessToken}`,
        `--paypal-environment=${this.environment}`,
        `--tools=${this.tools.join(',')}`],
    });
    this.client = new Client({ name: 'triad', version: '1.0.0' }, { capabilities: {} });
    await this.client.connect(transport);
    return this;
  }

  /** 全ツール呼び出しの唯一の入口。custom_id は必ず載せる（監査証跡） */
  async call(tool, args = {}) {
    if (this.mock) return this._mock(tool, args);
    const res = await this.client.callTool({ name: tool, arguments: args });
    return this._unwrap(res);
  }

  // --- 高レベル関数（アプリはこれだけ呼ぶ） ---
  createProduct({ name, description, type = 'SERVICE', category = 'SOFTWARE' }) { return this.call('create_product', { name, description, type, category }); }
  createPlan({ productId, name, amount, currency = 'EUR', interval = 'MONTH', customId }) {
    return this.call('create_subscription_plan', {
      product_id: productId, name,
      billing_cycles: [{ frequency: { interval_unit: interval, interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: amount, currency_code: currency } } }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },   // ★§2
      custom_id: customId,
    });
  }
  createSubscription({ planId, customId }) { return this.call('create_subscription', { plan_id: planId, custom_id: customId }); }
  cancelSubscription({ subscriptionId, reason }) { return this.call('cancel_subscription', { subscription_id: subscriptionId, reason }); }
  createRecurringSeries(args) { return this.call('create_recurring_series', args); }
  activateRecurringSeries(id) { return this.call('activate_recurring_series', { id }); }
  cancelRecurringSeries({ id, reason }) { return this.call('cancel_recurring_series', { id, reason }); }
  getMerchantInsights(args) { return this.call('get_merchant_insights', args); }
  listTransactions(args) { return this.call('list_transactions', args); }

  _unwrap(res) {                       // MCPは content:[{type:'text',text:'{...}'}] で返る
    const t = res?.content?.find(c => c.type === 'text')?.text;
    try { return JSON.parse(t); } catch { return { raw: t }; }
  }
  _mock(tool, args) { /* §1-4 の決定的Mock（後述） */ }
}
```

### 1-3. ★both sides を成立させる `src/mcpRegistry.js`（ここが致命傷の回避点）

**実測された制約：MCPサーバーは「起動時の `--access-token` に固定」される。** 商人のトークンで起動したサーバーは顧客の代理になれない。よって **2プロセス** 立てる。

```js
// src/mcpRegistry.js
import { PayPalMCPClient } from '../paypal/mcpClient.js';

/**
 * both sides = 商人(business) と 顧客(people) の2つのMCPサーバーを同時に生かす。
 * ★実測: MCPは起動トークンに固定されるため、1プロセスでは both sides 不可。
 */
export async function createBothSides({ businessToken, consumerToken } = {}) {
  const business = new PayPalMCPClient({ accessToken: businessToken ?? process.env.PAYPAL_MCP_TOKEN_BUSINESS });
  const consumer = new PayPalMCPClient({ accessToken: consumerToken ?? process.env.PAYPAL_MCP_TOKEN_CONSUMER });
  await Promise.all([business.connect(), consumer.connect()]);
  return {
    business, consumer,
    modes: { business: business.mode, consumer: consumer.mode },
    async close() { await business.client?.close?.(); await consumer.client?.close?.(); },
  };
}
```

- ★未検証: 顧客トークンで `create_subscription` が叩けるか（要は「顧客=payer」の権限モデル）。**Week2 の最初に実サンドボックスで確認する（最優先の検証項目）**。叩けなければ「顧客側は `create_order`→`pay_order`（Orders v2・実測済）で表現する」フォールバックに切替。

### 1-4. ★審査員がキー無しで再現できる設計（Mockモード）

`paypal/mcpClient.js` の `_mock()` を **決定論的** に実装する。これは `paypal/client.js` が既にやっている `_mockResponse` と同じ思想（実測済のパターン）。

```js
_mock(tool, args) {
  const hash = fingerprint({ tool, args });            // receipt.js を再利用（依存ゼロ）
  const id = `MOCK${hash.slice(0, 8).toUpperCase()}`;
  switch (tool) {
    case 'create_product':           return { id: `PROD-${id}`, name: args.name, status: 'ACTIVE' };
    case 'create_subscription_plan': return { id: `P-${id}`, status: 'ACTIVE', custom_id: args.custom_id };
    case 'create_subscription':      return { id: `I-${id}`, status: 'APPROVAL_PENDING', custom_id: args.custom_id,
        links: [{ rel: 'approve', href: `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=${id}` }] };
    case 'cancel_subscription':      return { id: args.subscription_id, status: 'CANCELLED' };
    case 'get_merchant_insights':    return { mock: true, churn_risk: 0.31, recovered: 2 };
    default:                         return { id, mock: true, tool, args };
  }
}
```

- `npm test` だけで **キー0本・ネット0回** で全フローが緑になる。審査員は `REPRODUCE.md` の3コマンドで完全再現。
- Mockでも `custom_id` を返すので、**監査証跡のデモは鍵なしで成立**する。

---

## 2. ★Subscriptions v1の実測済み知識（再発見不要のリスト）

### 2-1. 全フロー（本日ライブ実測済：product→plan→subscription 全て201 / APPROVAL_PENDING / custom_id刻印OK）

| # | ツール | 入力の要点 | 実測で得た結果 | 注意点 |
|---|---|---|---|---|
| 1 | `create_product` | `name`, `type`（実測: SERVICE）, `category`（実測: SOFTWARE） | `id` が `PROD-xxxx` で返る | ★`type`/`category` は必須。欠けると400 |
| 2 | `create_subscription_plan` | `product_id`, `name`, `billing_cycles[]`, `payment_preferences{}` | `id` が `P-xxxx`、`status: ACTIVE` | ★`billing_cycles` の `tenure_type:'REGULAR'` + `total_cycles:0`（無限）が必須。`sequence` は 1。 |
| 3 | `create_subscription` | `plan_id`, `custom_id` | `id` が `I-xxxx`、`status: APPROVAL_PENDING` | ★**この時点で課金は起きない**。`links[rel=approve]` を人間が踏むまで PENDING |
| 4 | （人間が approve URL） | — | `status: ACTIVE` に遷移 | ★自動化不可。ここが「人間の承認」= 作品の主張と一致 |
| 5 | `cancel_subscription` | `subscription_id`, `reason` | `status: CANCELLED` | ★解約は即時。返金は別API（`create_refund`） |

**金額は €表記（EUR）で作る**（ドイツ市場の説得力）。実測した `custom_id` 刻印は plan と subscription の両方で成功。

### 2-2. ★`payment_failure_threshold` を使ったリカバリ設計（要検証だが構造は確定）

`create_subscription_plan` の `payment_preferences` に以下を入れる（上記 `createPlan()` に実装済み）:

```js
payment_preferences: {
  auto_bill_outstanding: true,      // ★未払いを次回に繰り越して再試行させる
  payment_failure_threshold: 2,     // ★2回失敗で SUSPEND。1回なら再試行の余地を残す
}
```

**リカバリの設計（この作品の心臓）:**

```
課金失敗（list_transactions で status != COMPLETED を検知）
  → TRIAD 3体が審理（§3）
     ├ APPROVED  → リトライ = create_recurring_series → activate_recurring_series
     ├ CONDITIONAL → 値下げプラン（新plan作成）へ create_subscription で乗り換え
     └ DENIED/DISSENT → cancel_subscription（チャーンを受容し、理由を custom_id に刻む）
```

- ★`payment_failure_threshold=2` の意味：**1回目の失敗では即解約しない**。「AIが1回目で切るのを待つ」構造にすると、AIの判断に意味が生まれる（= 物語が立つ）。
- ★未検証: `create_recurring_series` / `activate_recurring_series` の正確な引数名と、`get_recurring_series` の戻り形状。**Week2 の実測項目（2番目に優先）**。ツール名は `mcp/index.mjs` から実測済みだが引数は未確認 → `--tools=create_recurring_series` で起動し `tools/list` を読めば確定する。

---

## 3. ★「課金失敗→AIが代理判断」の実装（3案・工数つき）

### 共通の土台 `src/subscriptionGate.js`（moneyGateの姉妹）

```js
export const SUB_ACTION = { RETRY: 'RETRY', DOWNGRADE: 'DOWNGRADE', ACCEPT_CHURN: 'ACCEPT_CHURN' };

/** 課金失敗イベント → TRIAD審理 → 代理実行（★ゲートは webmcp.js と同一ロジック） */
export async function adjudicateBillingFailure({ triad, mcp, failure }) {
  const purchase = { id: `sub_${failure.subscriptionId}`, amount: failure.amount, category: `subscription:${failure.planName}`, reason: failure.reason };
  const result = await triad.triadAdjudicate({ ...purchase, monthlyBudget: failure.merchantBudget, spentThisMonth: failure.monthSpent });
  // ★ここがゲート: DECISION が RETRY を許すかどうか
  if (result.decision === DECISION.APPROVED || result.decision === DECISION.CONDITIONAL) {
    const customId = receiptCustomId(result.receipt);
    const action = result.decision === DECISION.APPROVED ? SUB_ACTION.RETRY : SUB_ACTION.DOWNGRADE;
    const exec = await executeProxyAction({ mcp, action, failure, customId });
    return { ...result, action, exec, customId };
  }
  return { ...result, action: SUB_ACTION.ACCEPT_CHURN, exec: await executeProxyAction({ mcp, action: SUB_ACTION.ACCEPT_CHURN, failure }) };
}
```

### 3案

| 案 | 内容 | 追加ファイル | 工数 | リスク |
|---|---|---|---|---|
| **A：リトライのみ（最小）** | 失敗検知→3体審理→`create_recurring_series`+`activate_recurring_series` で1回だけ回復試行 | `subscriptionGate.js` + `tests/subscriptionGate.test.js` | **3日** | 低。動画が単調になる |
| **B：リトライ＋値下げ（推奨）** | 加えて CONDITIONAL 時に新プラン（€9.99→€6.99）を作り `create_subscription` で乗り換え。**TRIADの3値（APPROVED/CONDITIONAL/DENIED）がそのまま3つの行動に写像される** | A＋`paypal/subscriptions.js` に `buildDowngradePlan()` | **6日** | 中。プラン乗換の冪等性 |
| **C：両側最適化（both sides最大）** | 商人側 `get_merchant_insights`（チャーン率）を見て、顧客側の審理に「商人の許容ライン」を渡す。AG Gridに両側の数字を出す | B＋`src/mcpRegistry.js` の両トークン運用 | **10日** | 高。2トークンの権限モデルが未検証 |

### ★moneyGateのゲートを壊さない証明

1. **既存 `tests/moneyGate.test.js` を無改変で残す**（31 assertions は触らない）。
2. 新規 `tests/subscriptionGate.test.js` に **同じスパイ方式**（`spyPayPal` と同型の `spyMCP`）で以下を追加：
   - `DENIED`/`DISSENT` → `mcp.call` が **`cancel_subscription` 以外を0回**呼ぶ（= リトライしない）
   - `APPROVED` → `create_recurring_series` が **1回だけ**呼ばれる
   - `CONDITIONAL` → `create_subscription_plan`（値下げ）が呼ばれ、**元の金額では呼ばれない**
   - すべての `call()` 引数に `custom_id` が載っている（=`assertEveryCallStamped`）
3. `webmcp.js` の `triadCreateOrder` は**1文字も変えない**。新規ツールは `registerSubscriptionWebMCP()` として**別関数で追加**する（既存の5ツール登録は無傷）。
4. CI 相当の `npm test` に `subscriptionGate.test.js` を**追加**（既存2本は削らない）。

---

## 4. ★3分動画で映す技術デモの順序（秒単位、2:55で切る）

| 秒 | 画面 | 映る技術（審査員が「non-trivial」と判断する根拠） |
|---|---|---|
| 0:00–0:12 | 「Anna Schmidt, Berlin。€9.99/月の石鹸サブスク。今日、カードが落ちた。」 | 名詞：サブスク・€9.99・失敗した支払い |
| 0:12–0:35 | 商人のターミナル：`npx -y @paypal/mcp@1.8.1 --access-token=... --paypal-environment=sandbox --tools=create_subscription,...` が**起動する瞬間** | ★公式MCPを実プロセスで起動（技術実装の最大の証拠） |
| 0:35–1:05 | 失敗検知 → 3体が並列で議論（Advocate/Auditor/Witness の**別モデル名**が画面に出る） | 敵対的合意エンジン。`runner.js` の実動作 |
| 1:05–1:35 | Witness が **CONDITIONAL**（€6.99に値下げ）→ `create_subscription_plan` 実行 → 返ってきた `P-xxxx` が画面に出る | ★MCP経由の実API呼び出し |
| 1:35–2:00 | 顧客側：approve URL を人間（Anna役）が踏む → `status: ACTIVE` | ★人間の承認ステップ（自動化していないことの証明） |
| 2:00–2:25 | AG Grid ダッシュボード：全決定・3票・モデル名・`custom_id` の刻印を一覧。**1行を改ざん→ verify が赤くなる** | 監査証跡。`receipt.js` の改ざん検知 |
| 2:25–2:45 | `npm test` → `moneyGate: 31 passed, 0 failed` ＋ `subscriptionGate: N passed` | ★審査員の再現性の約束 |
| 2:45–2:55 | 一文：「決済は、合意が取れたときだけ動く。」 | — |

★敗因対策：**0:12 までに名詞（€9.99のサブスク・失敗した支払い）を必ず出す。THE LAST WORDはこれが無かった。**

---

## 5. ★37日の実装スケジュール（週単位・時間・担当）

前提：1日4時間。合計 約148h。**11/10 コードフリーズ / 11/11-12 録画・文書のみ。**

| 週 | 日付 | 目標 | 具体タスク | 時間 | 担当 |
|---|---|---|---|---|---|
| W1 | 10/07–10/13 | **Mock固定でE2E緑** | `mcpClient.js` + `_mock()` / `mcpServers.json` / `subscriptionGate.test.js`（案Aのゲート証明）/ `REPRODUCE.md` | 28h | ボス監修・実装はHermes/Claude |
| W2 | 10/14–10/20 | **Live MCP接続** | ★最優先検証3件：①顧客トークンで `create_subscription` 可か ②`create_recurring_series` の引数 ③`get_merchant_insights` の戻り / `mcp.live.sandbox.mjs` | 28h | 実装 |
| W3 | 10/21–10/27 | **both sides UI＋案B** | `demo/public/index.html` 2画面 / `buildDowngradePlan()` / AG Grid `dashboard.js` | 28h | 実装＋デザイン |
| W4 | 10/28–11/03 | **動画＋Bryntum/Channel3** | 動画撮影（§4の秒割り） / Bryntum でタイムライン表示 / Channel3 で商品実在性 | 28h | 録画＋実装 |
| W5 | 11/04–11/09 | **発表資料＋磨き** | `MCP-ARCHITECTURE.md` / Devpost本文（who/why） / READMEスクショ | 24h | 文書 |
| W6 | 11/10–11/12 | **フリーズ＆提出** | 11/10 コードフリーズ / 11/11 録画最終 / 11/12 提出（**JST 11/13 07:00 の24h前**） | 12h | ボス |

**バッファ：11/10以降はコードを触らない。** 触ると demo が死ぬ（過去の実測パターン）。

---

## 6. ★リスクと対策（特に依存ゼロ方針 vs npm依存）

| リスク | 深刻度 | 対策 |
|---|---|---|
| **依存ゼロ方針の崩壊** | 中 | ★`@paypal/mcp` は `npx` の**別プロセス**なのでアプリの `package.json` に入れない。アプリ本体は `node:crypto` と `fetch` だけのまま。**依存は `paypal/` ディレクトリ内に物理的に隔離**。「依存ゼロはアプリの性質、MCPは外部プロセス」と README に1行書く |
| `@modelcontextprotocol/sdk` が必要 | 低 | ★未検証：stdio JSON-RPC を自前実装すれば不要。**まずSDKで動かし、余裕があれば自前化**（自前化できれば完全依存ゼロで強い） |
| **2トークン運用が不可能** | 高 | ★Week2初日に検証。不可なら顧客側を `create_order`→`pay_order`（Orders v2・**実測済**）にフォールバック。アーキテクチャは変えずアダプタ1関数の差し替えで済む |
| MCPの引数名が実測と食い違う | 中 | `--tools=...` で起動し `tools/list` を読んで確定。**推測で実装しない**（§2-1 の表に実測分と未検証分を分離済み） |
| sandboxの仕様変更（11月） | 低 | 11/10 フリーズ前に全フロー再実行。締切前に壊れたら Mock 動画に切替（Mockは決定論的で壊れない） |
| 抽象化して名詞が消える | **高** | 動画0:12までに「€9.99のサブスク・失敗した支払い・Anna」を必ず出す。§4で秒指定済み |
| スコープ拡大（both sides欲張り） | 中 | 案A→B→Cの順。**Cは時間が余った時だけ**。案Aだけでも提出可能な状態を W1 で作る |

---

## 7. ボスへの推奨（1つに絞る）

**★案B（リトライ＋値下げ）で、`@paypal/mcp` を「npxの別プロセス」として使う。both sides は演出として両方見せるが、代理実行は商人側のMCP 1本で行う。**

理由：
1. **技術実装で最も強い形**。公式MCPを実プロセスで起動し `create_subscription_plan` / `create_subscription` / `create_recurring_series` を呼ぶのは「non-trivial」の定義そのもの。しかも custom_id 刻印で**支払い記録＝監査証跡**になる。
2. **TRIADの3値が行動に写像される**（APPROVED→リトライ / CONDITIONAL→値下げ / DENIED→解約受容）。既存の 31 assertions を1文字も壊さず、`subscriptionGate.test.js` を足すだけで証明が増える。
3. **リスクが最小**で37日で確実に動く。顧客側のMCP権限（最大の未知）に依存せず、Orders v2（実測済）でフォールバックできる。

名前は **「€9.99」** を推奨（THE LAST WORDの教訓＝名詞）。次点は「SUBSCRIPTION GATE」。
