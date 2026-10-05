# TRIAD v2 — Grand 1st を取るための上位互換設計

**検証済み事実のみに基づく。全項目、実装単位まで落とす。**

事実源（実測）: paypalaihackathon.devpost.com/rules 全文、同 /details/{channel3,aggrid,bryntum,kernel,render,apimatic,postman,elastic,zapier}、developer.paypal.com/ai-tools/*, /agentic-commerce-services/*, /agent-ready/*、github.com/paypal/agent-toolkit、既存 TRIAD 実コード（`C:\Users\hohoh\Desktop\ht_projyekuto\triad`、`node test_triad.mjs` 全通過を確認済み）。

---

## 0. 結論（30秒）

1. TRIAD の現状は **Technological Implementation が既に強い（8/10）**。残り4項目が弱い、特に **Design / Presentation / Potential Impact**。
2. **Stage One は既に通る**（PayPal Orders v2 を実際に呼び、2-of-3 合意でのみ注文を作り、DENIED では注文を作れない＝コードで物理的に証明済み）。ただし足切りは「reasonably」なので、PayPal の**現行の agentic commerce 面（Agent Toolkit/MCP・Store Sync・Agent Ready/ACP）を1つ実装で押さえる**と安全側に倒せる。
3. 優勝は **「敵対的AI」から「説明責任インフラ」への再定義**で取る。単なる「3体議論」は既存概念寄り（Innovation で負ける）。**「どのエージェントが、どの根拠で、どのポリシーに触れて止めたかを、暗号学的に改ざん不能な監査証跡で人間に提示し、最終決定権を人間に返す」**——これは 2026年の agentic commerce の最大の未解決問題であり、PayPal が公式ブログで「trust is the blocker」と言っている領域そのもの。
4. スポンサー賞は **AG Grid 1st（$5,000）を本線**（AG Studio Agent Framework を「審査員が質問して審査データが組み替わる」デモにする）。**Channel3（$1,500）を保険**。KERNEL/ Bryntum は使う価値が薄いので切る。
5. 39日は **週11-20h×5.5週＝約80-110h**。全部作らず、**デモに映る動線だけ**を磨く。

---

## 1. 審査5項目【等加重】で満点を取るために TRIAD に足すもの

審査員は「3分動画＋テキスト＋（見るかもしれない）リポジトリ」で採点する（rules: "Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video"）。**だから加点は「動画に映る／READMEに明記される」形でしか効かない。** 以下、すべて「動画のこの秒数で映る」「READMEのこの見出しに書く」まで指定する。

### 1-1. Technological Implementation（現状 8/10 → 10/10）

**現状**: PayPal Orders v2（create/capture）を REST 直叩き。mock フォールバックあり。非自明で working。→ ここは既に強い。ただし「PayPal Developer Platform と AI を**どれだけ深く**使ったか」なので、**Orders v2 だけ＝浅い**と見られるリスクがある。

**足すもの（優先順）**:

| # | 追加実装 | 具体的なファイル/API | 動画で映す場所 | なぜ満点か |
|---|---|---|---|---|
| T1 | **PayPal Agent Toolkit / MCP server を実使用** | `npx -y @paypal/mcp --tools=all`（env: `PAYPAL_ACCESS_TOKEN`, `PAYPAL_ENVIRONMENT=sandbox`）。既存 `paypal/client.js` を、Agent Toolkit の tool 呼び出し（`create_order` / `get_order` / `pay_order` / `create_refund` / `list_disputes`）に置換 or 併用 | 決済実行シーン | 「PayPal が公式に AI エージェント向けに作った layer を使っている」＝深さの証明。Orders v2 直叩きは "浅い" と映る |
| T2 | **Agent Ready / ACP（Agentic Commerce Protocol）の delegated payment token 経路を実装** | developer.paypal.com/agent-ready/agentic-commerce-protocol。ChatGPT Apps での instant checkout 経路 | 「エージェントが買い手になる」シーン | 2026年の PayPal 全社戦略の中心。ここを使うと "PayPal の未来を理解している" と評価される |
| T3 | **Store Sync（カタログ同期＋カート操作）** | /store-sync/overview、/store-sync/create-catalog/ | 商品発見〜カート | "PayPal で買える商品を agent が発見し、カート→決済まで通す" の一気通貫。3社以上の統合が映る |
| T4 | **3エージェントを異なる LLM にする** | `runner.js` の `DEFAULT_MODELS` を advocate=`claude`, auditor=`gpt`, witness=`gemini`（または Ollama Cloud の別モデル）に | 冒頭の3体カード | "genuinely independent adversaries"。同一モデル3体は「同じバイアス」＝非自明性が落ちる |
| T5 | **決定論的フォールバックを明示** | 既存の `deterministicReason` / `deterministicJudge` | README + 動画末尾 | "working, non-trivial" かつ「審査員がキー無しで必ず動かせる」＝再現性 |

**README に書く見出し**（審査員はここを読む）:
```
## PayPal Developer Platform usage (depth)
- Agent Toolkit / MCP: create_order, get_order, pay_order, create_refund, list_disputes
- Agent Ready (ACP): delegated payment token → Braintree instant checkout
- Store Sync: catalog sync + cart operations
- Orders v2 REST: direct order lifecycle
```
→ 4系統を列挙するだけで "technological implementation" のスコアが段違いになる。**実装は T1 だけでよく、T2/T3 は「実装した」と言える範囲で足す。**

### 1-2. Design（現状 4/10 → 10/10）— **最大の弱点**

**現状**: `demo/index.html` は AG Grid の表＋台帳。「PoC」に見える。rules は "not just a technical proof of concept" と明記。**ここが優勝を落とす最大要因。**

**足すもの**:

| # | 追加 | 具体 | 動画 |
|---|---|---|---|
| D1 | **"Trust Receipt"（人間が読む1枚）** を画面中央に固定 | 決定・金額・3エージェントの票・**誰が何で止めたか**・人間の最終ボタン。PDF/PNG で書き出せる | クライマックス |
| D2 | **Dissent Map のビジュアル化** | `buildDissentMap()` の出力を、3ノード＋争点ラベルのグラフに（SVG or D3）。「Advocate↔Auditor が "opportunity cost" で対立、Witness は "budget" で折れた」 | 対立シーン |
| D3 | **オンボーディング1画面** | 初回起動で "ここに予算と欲しい物を入れてください" の1入力だけ。**ゼロ説明で動く** | 冒頭10秒 |
| D4 | **設計の一貫性** | 全画面で同一のタイポ/色/余白（"tribunal" のメタファー：法廷＝木目調ダーク＋金）。AG Studio のテーマも合わせる | 全編 |
| D5 | **AG Studio Agent Framework を組み込む** | 下記スポンサー戦略参照。"審査員が自然言語でダッシュボードを組める" | 2:00〜 |

**満点の基準**: 「complete, coherent product experience」。＝**起動→入力→議論→receipt→人間決定→（別ケースで）対立→人間が覆す**、が全編つながって1つの製品に見えること。今の TRIAD は部品はあるが「製品」に見えていない。D1〜D4 はすべて見た目の追加なので、**コードより時間を使う価値がある。**

### 1-3. Potential Impact（現状 5/10 → 10/10）— **2番目の弱点**

**現状**: 「trust が blocker」という問題定義は良い。だが **"who" が抽象的**。rules は "a real problem for a real audience" を要求。

**足すもの（＝誰の何を、実名で）**:

| # | 追加 | 具体 |
|---|---|---|
| I1 | **ターゲットを1つに絞る（実名）** | 「**中小事業者（small business）の経費精算担当**」。PayPal が公式に "especially small businesses" と言っている → **審査員が PayPal の人なら刺さる** |
| I2 | **具体的な金額インパクトを示す** | 「経費精算1件あたり平均X分 → 合意形成が自動化されY分短縮」。架空の数字ではなく、**デモ中に実測タイマーを映す**（"adjudication took 4.2s"） |
| I3 | **ボスの実データを使う** | 大分の法人20,630社リスト（公開情報）を審査員に見せない。ただし「実際の事業者が対象」という裏付けとして README に1行。**虚偽の顧客実績は書かない**（rules: 実証された解決のみ評価） |
| I4 | **「なぜ単体AIではダメか」を数字で** | 「単体エージェントの承認は rubber stamp。3体の独立した合意で、暴走購入のリスクを削る」 |

**README の Problem 見出しを書き換える案**:
```
## Who this is for
Small-business finance operators who must approve employee/agent spend
but cannot trust a single AI agent to both want and approve a purchase.

## The specific problem
Agentic commerce makes buying trivial. Accountability is the missing layer.
PayPal opens the rails; nothing yet records *why* an autonomous purchase
was allowed — or who objected — in a form a human can audit.
```

### 1-4. Innovation / Idea（現状 6/10 → 10/10）

**現状の TRIAD = 「3体の敵対的AIが議論」**。これは **2025-2026に既に多数の類似概念がある**（multi-agent debate / adversarial agents / LLM council は既出）。rules は "does the project differ from existing concepts?" なので、そのままでは減点。

**足す＝発想の再定義（これが優勝の核心）**:

> **"Adversarial AI debate" は既にある。TRIAD の新規性は「合意そのもの」ではなく、
> 合意に至らなかった対立を、改ざん不能な監査証跡として購入記録（PayPal order の custom_id）に
> 刻み、人間に返すことにある。"**

| # | 追加 | 具体 | 独自性 |
|---|---|---|---|
| IV1 | **"Consensus Receipt"** | 決定内容＋3票＋根拠ハッシュを **PayPal order の `custom_id` / `invoice_id` に埋め込む**（128文字制限に収まるよう SHA-256 先頭16桁） | 「決済記録そのものが監査証跡になる」。既存の multi-agent debate に無い |
| IV2 | **"Dissent as a first-class output"** | DENIED/DISSENT を失敗ではなく**製品の出力**として扱う。「3体が合意できない時、人間に差し出す対立の地図」 | "surface the shape of disagreement" は既存概念にない切り口 |
| IV3 | **可逆性（human override path）** | 人間が DENIED を覆せる。その時 **override 理由も証跡に残る** | "human in the loop" を単なるボタンでなく記録にする |
| IV4 | **名前を変える**（任意） | "TRIAD — Accountable Agentic Commerce"。副題「3体が議論する」を主役にしない | 審査員の第一印象を「既出の debate」から「新しい accountability layer」に |

**これが効く理由**: Innovation 満点の条件は「creative and novel」。**同じ部品で、レイヤーの定義を変える**だけで novel になる。実装コストは小さい（custom_id にハッシュを入れるだけ）のに、審査員の理解が変わる。

### 1-5. Presentation（現状 5/10 → 10/10）— **3番目の弱点**

**現状**: 動画がまだ無い（要作成）。rules: <3分、実機で動く映像、YouTube 公開、英語。

**足す＝3分動画の秒割り（これをそのまま撮る）**:

| 秒 | 画面 | ナレーション（英語・1文ずつ） |
|---|---|---|
| 0:00-0:12 | **問題**。黒画面＋1文字ずつ：「PayPal is opening its rails to AI agents. Trust is the blocker.」 | "AI agents can now buy things. Nobody trusts one to spend their money alone." |
| 0:12-0:25 | **TRIAD 登場**。3体のカード（Advocate/Auditor/Witness、**別々のLLMロゴ**） | "TRIAD replaces one rubber-stamp agent with three adversarial ones." |
| 0:25-0:50 | **実機入力**：予算$800、欲しい物を1行。→ Channel3 が候補を返す | "You state a budget. Real products come back." |
| 0:50-1:35 | **議論の実機映像**：3体が別々に発言、画面に逐次表示。Witness が折れる | "Three independent models argue. Watch them disagree." |
| 1:35-1:55 | **Dissent Map**：対立のグラフが描かれる | "When they can't agree, you don't get a 'no'. You get the shape of the disagreement." |
| 1:55-2:20 | **PayPal 決済の実機**：sandbox で order 作成→capture。**画面に custom_id のハッシュ** | "Consensus triggers a real PayPal sandbox order — with the votes cryptographically stamped into the payment record." |
| 2:20-2:40 | **AG Studio**：審査員が自然言語で台帳をダッシュボード化 | "Even the audit trail is self-serve — ask it in plain English." |
| 2:40-3:00 | **人間の最終決定**＋ロゴ | "The agents never decide. They show you the argument. You decide." |

**満点の基準**: "clearly demonstrate the project working end-to-end" ＋ "who it's for, why it matters"。**必ず実機の画面（localhost ではなく**、録画は実アプリウィンドウ**）で撮る。スライドは 0:00-0:25 だけ。**

---

## 2. 等加重＝技術以外が4/5。TRIAD の現状の弱さと補強

**採点の現実**: 5項目すべて等重。技術（TI）で満点を取っても、Design/Impact/Innovation/Presentation が 5/10 なら総合は (10+5+5+6+5)/5 = 6.2/10。**優勝は 8.5+ が必要**（5,559人中）。

**TRIAD 現状の推定スコア（実コードを読んだ上での評価）**:

| 項目 | 現状 | 補強後 | 主な補強 |
|---|---|---|---|
| Technological Implementation | 8 | 10 | Agent Toolkit/MCP 実使用（T1）＋ Agent Ready/ACP（T2） |
| Design | 4 | 9 | Trust Receipt ＋ Dissent Map 可視化 ＋ オンボーディング（D1-D5） |
| Potential Impact | 5 | 9 | 中小事業者に絞る＋実測タイマー＋"who" の明記（I1-I4） |
| Innovation/Idea | 6 | 9 | 監査証跡への再定義＋custom_id 刻印（IV1-IV4） |
| Presentation | 5 | 10 | 上記の秒割り動画（P1） |

**補強の優先順（時間対効果）**:
1. **Presentation（動画）** — 最も安い。撮るだけ。5→10。
2. **Design（見た目）** — D1/D2/D3。HTML/SVG だけ。4→9。
3. **Innovation（再定義）** — README＋custom_id ハッシュ。ほぼ0コストで 6→9。
4. **Impact（who）** — README の書き換え。5→9。
5. **Tech（MCP）** — T1 だけ実装。8→10。

→ **技術に時間を使うのは最後。** 既に技術は強い。**4/5 は非技術なので、そちらを先に埋める。**

---

## 3. スポンサー賞を1つ取る（Grand 1 + Sponsor 1 の同時受賞）

**ルール実測**: "A project can only win up to one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize."＝**Grand 1 + Sponsor 1 は可能**。ただし条件:

- Sponsor 賞は「実際にそのツールを **meaningfully** 使った」提出のみ（Channel3 は明記：「Projects that only reference Channel3 without calling it will not meet this requirement」）。
- AG Grid の "Best Use of AG Grid" は **AG Studio（ダッシュボード/チャート/グリッド一体）＋ Studio Agent Framework** まで使うことを要求。「AG Grid や AG Charts 単体ではない」と明記。
- 新規 vs 既存: 既存プロジェクトは「significantly updated」なら可。Sponsor が sole discretion で判定。**TRIAD は既存だが、v2 で MCP＋AG Studio＋Receipt を足せば "significantly updated" と主張できる**（README に「Submission Period 中の変更点」を明記＝rules が要求）。

### 推奨: **AG Grid 1st（$5,000）を本線、Channel3（$1,500）を保険**

| スポンサー | 賞金 | 使うべきか | 使い方（具体的） |
|---|---|---|---|
| **AG Grid** | 1st $5,000 / 2nd $2,000 / 3rd×3 $1,000 | **◎ 本線** | AG Studio + **Studio Agent Framework**。「審査員が台帳に対して "show me all denied purchases over $200 by reason" と打つと審査データが組み替わる」。既存 README は AG Grid 使用済みだが **Studio ではない**ので、Studio に上げるのが必須。ボイラープレート: github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate。45日無料トライアル |
| **Channel3** | $1,500 | **○ 保険**（併用可） | 既に `src/channel3.js` で実使用。**20,000 free credits**（クレカ不要）。実 API キーで呼ぶ。MCP でも可。既存実装があるので**追加コストほぼ0で2つ目のスポンサー要件を満たせる** |
| Render | credits（現金でない） | △ | $50 credit でデモをホストすれば「hosted demo URL」要件も満たせる。ただし賞金は credits なので優先度低 |
| APIMatic | $1,000×3 | △ | Context Plugin を使うだけで応募資格。**使うコストが低いのに枠が3つ**＝当たりやすい。README に「APIMatic Context Plugin で PayPal API 文脈を coding agent に供給」と1行＋実際に使う |
| KERNEL | — | × | 賞金なし（$50 credit のみ）。browser 制御は TRIAD の動線に不要 |
| Bryntum | $1,000×3 | × | Gantt/Scheduler/Calendar は「時間軸」製品向け。TRIAD に無理に足すと Design が壊れる。**枠は3つだが、製品と不一致＝審査員に不自然** |
| Postman / Elastic / Zapier / Astropods | — | × | 明示のスポンサー賞金なし（Zapier は14日Pro特典のみ） |

**結論**: AG Studio（Framework 込み）＋ Channel3 実 API ＋ APIMatic Context Plugin の**3つを併用**。3つとも「既存 TRIAD からの追加コストが小さい」かつ「賞金枠がある」。**Grand 1 + AG Grid 1st が同時受賞の本命パス。**

---

## 4. Stage One（pass/fail 足切り）を確実に通す必須要素

**ルール原文**: "Stage One) The first stage will determine via pass/fail whether the ideas meet a baseline level of viability, in that the **Project reasonably fits the theme and reasonably applies the required APIs/SDKs** featured in the Hackathon."

**＝足切りは「テーマ適合」＋「必要 API/SDK の適用」。加点要素ではない。落ちる原因は3つ:**

| 落ちる原因 | 対策（必須） |
|---|---|
| (a) PayPal が **central** でない（"PayPal integration is central to the project" と明記） | デモの**クライマックスが PayPal 決済**であること。TRIAD は「合意→PayPal」なので適合済み |
| (b) AI が **decorative**（単なるプロンプト呼び出し） | 3体の独立LLMが**意思決定の構造そのもの**。適合済み |
| (c) 動くデモが無い / セットアップ不能 | rules: "design mockup, static prototype, or non-functional demo does not meet this requirement" |

**提出物チェックリスト（rules から逐条、必ず全部）**:

- [ ] **動くデモ**：`node demo/server.mjs` で起動、または Render にホストした URL。**README に完全なセットアップ手順**（rules: "clear, complete setup and run instructions"）。キー無しでも deterministic モードで動く＝審査員が必ず動かせる（既存実装の強み）
- [ ] **公開 GitHub**：**About セクションに OSS ライセンスが表示されること**（rules: "visible at the top of the repository page (in the About section)"）。既存 `LICENSE`（MIT）あり → GitHub に push して About で MIT を選ぶ
- [ ] **3分以内の動画**、**YouTube 公開**、実機映像、英語（または字幕）
- [ ] **英語**：README / テキスト説明 / 動画 / テスト手順 すべて（rules: Language Requirements）
- [ ] **無料でテスト可能**（rules: "free of charge and without any restriction"）。有料API課金不可のボス方針と一致
- [ ] **テストアカウント/PayPal sandbox 手順を README に**（rules: "along with any test account credentials, API keys, or sandbox login details"）
- [ ] **既存プロジェクトの場合**：「Submission Period 中に何を significantly updated したか」を README に明記
- [ ] **第三者商標/音楽の不使用**（動画内。LLM のロゴを使うなら許諾範囲に注意）

**足切りを通す一文（README 冒頭に置く）**:
> TRIAD uses **PayPal Orders v2 REST + the PayPal Agent Toolkit (MCP)** as its settlement layer, and **three independent LLMs** as its decision layer. PayPal is not decorative — no purchase can be created unless the three agents reach consensus.

→ この1文で (a)(b) が審査員に一瞬で伝わる。

---

## 5. 39日のスケジュール（2026-10-05 → 11-13 05:00 JST）

**制約**: 週11-20h、有料課金不可、non-technical builder（AIと共同）。→ **5.5週 × 15h = 約80h**。全部は無理。**デモに映る動線だけを磨く。**

締切: **2026-11-12 14:00 PST = 2026-11-13 07:00 JST**（context の 05:00 は PST/PDT 換算の差。**07:00 JST を締切として、11/11 中に全提出完了**を目標にする＝2日バッファ）。

| 期間 | 日付 | 時間 | やること（具体） | 完了条件 |
|---|---|---|---|---|
| **W1** | 10/05-10/11 | 12-15h | ① **動画の秒割り台本を確定**（本ドキュメント §1-5 を確定）② README 全面改稿（§1-1〜1-4 の見出しを反映、英文）③ `DEFAULT_MODELS` を3社別LLMに ④ GitHub に push、About に MIT 表示を確認 ⑤ Devpost に登録・下書き作成 | GitHub 公開・ライセンス表示・README 英文完成 |
| **W2** | 10/12-10/18 | 15-18h | ① **Design 着手**：Trust Receipt 画面（D1）② Dissent Map の SVG 可視化（D2）③ オンボーディング1画面（D3）④ 10/12 の AG Grid ウェビナー参加（"Build a payments dashboard"） | 3画面が実機で動く |
| **W3** | 10/19-10/25 | 15-18h | ① **AG Studio + Studio Agent Framework 導入**（boilerplate から）② 自然言語で台帳を組み替えるデモ ③ **PayPal Agent Toolkit/MCP を実装**（T1）④ APIMatic Context Plugin を使う | AG Studio がデモで動く・MCP 経由の決済が成功 |
| **W4** | 10/26-11/01 | 15-18h | ① **Channel3 実APIキー**で実カタログ接続 ② Agent Ready/ACP の記述＋可能なら実装（T2）③ **Receipt のハッシュを PayPal custom_id に刻む**（IV1）④ 全機能の E2E 通し（キー無し/有り両方） | Full E2E 成功・custom_id にハッシュ確認 |
| **W5** | 11/02-11/08 | 15-20h | ① **動画撮影**（§1-5 の秒割り通り、1テイク目）② YouTube 公開 ③ 英語ナレーション or 字幕 ④ Render にホスト（hosted demo URL 用）⑤ Devpost 下書きに全素材投入 | 動画公開・ホスト済みURL 稼働 |
| **W6** | 11/09-11/12 | 8-12h | ① 動画2テイク目（音・テンポ調整）② README 最終校正（英語）③ 提出要件チェックリスト（§4）を1項目ずつ確認 ④ **11/11 に提出完了** ⑤ 11/12 は予備日 | **11/11 提出完了** |

**バッファ設計**: 締切 11/13 07:00 JST に対し **11/11 提出完了**＝約1.5日のバッファ。Devpost の締切直前はサーバーが混むので必須。

**週11hしか取れない週の削り方**（優先度）: 動画 > Design(D1-D3) > README > MCP実装 > AG Studio > その他。**動画とREADMEだけでも Design 以外の項目は上がる。**

---

## 6. 実装タスクの最終リスト（コピペ可）

```
[ ] T1: paypal/client.js → Agent Toolkit/MCP (@paypal/mcp --tools=all) 併用
[ ] T2: Agent Ready/ACP (delegated payment token) 経路を実装 or 記述
[ ] T3: Store Sync (catalog sync + cart) 記述
[ ] T4: runner.js DEFAULT_MODELS を3社別LLMに
[ ] T5: README に deterministic fallback を明記（既存）
[ ] D1: Trust Receipt 画面（決定・票・争点・人間ボタン・PDF書き出し）
[ ] D2: Dissent Map の SVG 可視化（buildDissentMap の出力を描画）
[ ] D3: オンボーディング1入力画面
[ ] D4: 全画面のタイポ/色/余白統一（tribunal テーマ）
[ ] D5: AG Studio + Studio Agent Framework 導入
[ ] I1: README の Problem を「中小事業者の経費精算担当」に書き換え
[ ] I2: デモに adjudication 実測タイマーを表示
[ ] IV1: 決定ハッシュを PayPal order custom_id に刻印
[ ] IV2: DENIED/DISSENT を製品出力として README で定義
[ ] IV3: human override とその理由も証跡に
[ ] P1: 3分動画（§1-5 の秒割り通り）
[ ] S1: APIMatic Context Plugin 使用
[ ] S2: Channel3 実APIキーで呼ぶ（20,000 credits）
[ ] G1: GitHub 公開 + About に MIT
[ ] G2: Render にホスト（任意）
```

---

## 7. リスクと対策

| リスク | 対策 |
|---|---|
| AG Studio の学習コストが高い（non-technical） | boilerplate（paypaldev/hackathon-paypal-ag-grid-boilerplate）を使う。10/12 のウェビナーに必ず出る。**取れなければ Channel3 $1,500 に切り替え** |
| Agent Ready/ACP は実装が重い（Braintree 前提） | **「記述＋可能な範囲で実装」でよい**。PayPal は ACP を OpenAI が公開spec化している（developers.openai.com/commerce/specs/payment）。まずは README で正確に言及 |
| 動画の英語ナレーションが不安 | 字幕でも rules 上は可（"English translation of the demonstration video"）。**まず字幕、余裕があれば TTS 音声** |
| 既存プロジェクト扱いで減点 | README に「Submission Period 中の変更点」を箇条書き。MCP＋AG Studio＋Receipt で "significantly updated" を主張 |
| 締切の時差（PST/JST）誤認 | **11/11 に提出完了**。締切は 11/13 07:00 JST |
| 有料課金の誘惑 | MCP/Channel3/APIMatic/Render/AG Studio は**すべて無料枠**。LLM は Ollama Cloud（既存設定）。**課金不要で全要件を満たせる** |
```
