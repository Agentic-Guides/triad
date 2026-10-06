# 視点B：技術設計 — スポンサー10社をTRIADのどこに置くか

**作成日**: 2026-10-06
**対象コード**: `C:\Users\hohoh\Desktop\ht_projyekuto\triad`（実読）
**根拠**: `paypalaihackathon.devpost.com/rules` 全文（2026-10-06 実測取得）+ 各 `/details/<sponsor>` ページ（2026-10-06 実測取得）+ 実リポジトリのソース。

---

## 技術的な結論（1文）

**LLM（`src/runner.js` の3体）は Ollama Cloud のまま維持し、スポンサー10社は LLM 層には一切入れず「決済の周辺（監査・可視化・デプロイ・カタログ）」の機能パーツとしてだけ組み込むのが技術的に正しい。なぜなら PayPal の公式ルールは「スポンサー利用は任意（not required）」で、中央に据えるべきは PayPal 統合だけであり、LLM を Elastic/Astropods に置換しても審査5項目のうち加点されるのは最大2項目、失うもの（敵対的独立性・キー無し再現性・38日の工数）は5項目すべてに波及するから。**

---

## 0. 判断の土台（公式ルールから取った事実だけ）

実測で取れた原文（これが本分析の全根拠）:

| # | 原文（rules / details） | この分析での意味 |
|---|---|---|
| R1 | *"Entrants must build or update an application that **integrates the PayPal developer platform** (using the free sandbox environment) along with **an AI tool, model, or platform of their choice**"* | **必須は PayPal のみ**。AI 側は「of their choice」＝完全に自由 |
| R2 | *"PayPal will provide access to select AI sponsor tools that entrants are **welcome to use**, though **using one of these partner tools is not required**. Any AI tool works, **as long as PayPal integration is central to the project**."* | スポンサーは**任意**。中央に来るのは**PayPal だけ**。原文に *"any AI tool works"* と明記 |
| R3 | *"The only fundamental requirement: your project must meaningfully use both PayPal and AI."* | 必須要件は2つだけ。LLM の出所は要件に含まれない |
| R4 | Stage One: *"the Project reasonably fits the theme and reasonably applies **the required APIs/SDKs**"* | 足切りで見るのは**required**（＝PayPal）の適用。スポンサーは required に入っていない |
| R5 | *"Best Use of AG Grid…Eligible Submissions that **use any AG Grid tools**"* / Channel3: *"Projects that **only reference** Channel3 **without calling it** will not meet this requirement"* | スポンサー賞は**独立した別賞**。取るには「実際に呼ぶ」こと |
| R6 | *"A project can only win up to one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize."* | Grand/HM とスポンサー1つは**同時に取れる**。→ 戦略は「Grand を狙いつつスポンサー1つ」 |
| R7 | Tie Breaking: *"the tied Submission with the highest score in **the first applicable criterion**"*（= Technological Implementation） | 同点時は**技術実装**で決まる。技術を削るのは危険 |

**R2 が本件の答えそのもの**：「基本部分（LLM）にスポンサーを入れよ」とは**どこにも書いていない**。原文は逆で、PayPal を中央に置け、AI は何でもよい、スポンサーは任意、と言っている。

---

## 1. 「基本部分」と「機能パーツ」の切り分け

### 1-1. 定義（TRIAD の実アーキテクチャに当てはめる）

TRIAD の現行パイプラインは**5層**。これを実コードのモジュールで切る:

```
┌─ L1 判断層 (Decision) ─────────────────────────────────────────┐
│  src/triad.js  : adjudicate() / DECISION / buildDissentMap()    │
│                  2-of-3 合意 → APPROVED/CONDITIONAL/DENIED/DISSENT│
│  ★ここが「TRIADである理由」。決定論的で、LLM に依存しない        │
├─ L2 推論層 (Reasoning) ─────────────────────────────────────────┤
│  src/runner.js : TriadRunner.debate()                            │
│                  advocate/auditor/witness を LLM に繋ぐ           │
│                  ★基本部分。Ollama Cloud。3体が別モデル          │
├─ L3 証跡層 (Evidence) ──────────────────────────────────────────┤
│  src/receipt.js: buildReceipt() → SHA-256 → triad1:<hash>        │
├─ L4 決済層 (Settlement) ★PayPalが中央 = required ────────────────┤
│  paypal/client.js: createOrder()/captureOrder()  custom_id刻印    │
│  src/webmcp.js   : triadCreateOrder() の Money Gate               │
├─ L5 提示層 (Surface) ───────────────────────────────────────────┤
│  demo/index.html : AG Grid ×2 / demo/server.mjs                  │
└──────────────────────────────────────────────────────────────────┘
   横断: src/channel3.js (カタログ) / src/commerce.js ( triadShop() )
```

### 1-2. 切り分け表（技術的判定）

| 層 | これは「基本部分」か「機能パーツ」か | 触ってよいか |
|---|---|---|
| **L1 判断層** | **基本部分（核）**。ここを外部サービスに置換＝TRIAD の独自性(Innovation項目)が消える | **絶対に触らない** |
| **L2 推論層（LLM）** | **基本部分**。ただし**外部サービスへの置換は不要**。既に `TriadRunner` が OpenAI 互換でプロバイダ非依存＝差し替え点は実装済み | **Ollama Cloud のまま**（理由は §1-4） |
| **L3 証跡層** | **基本部分**。`node:crypto` のみ・依存ゼロ。ここが Innovation の主張点 | 触らない |
| **L4 決済層** | **基本部分かつ required**。PayPal Orders v2 が中央 | 拡張のみ（Agent Toolkit 併用など） |
| **L5 提示層** | **機能パーツが入る場所**。AG Studio / Bryntum はここ | ここに投資 |
| **横断: カタログ** | **機能パーツ**。Channel3 は L4 の前段（入力を実データにする） | ここに投資 |

### 1-3. 図：基本部分 vs 機能パーツの配置

```
                        [ 基本部分 = 触らない ]
  ┌───────────────────────────────────────────────────────────┐
  │  L1 triad.js adjudicate()  ← 判断の核（決定論的）          │
  │        ▲ 3票                                             │
  │  L2 runner.js debate()  ← Ollama Cloud 3モデル            │
  │        ▲ reasons                                         │
  │  L3 receipt.js buildReceipt() ← SHA-256 指紋              │
  │        ▲ custom_id triad1:<hash>                         │
  │  L4 paypal/client.js createOrder() ★PayPal=central        │
  └───────────────────────────────────────────────────────────┘
             ▲                                    ▲
             │ 機能パーツは「横」から刺さる         │
  ┌──────────┴──────────┐          ┌──────────────┴───────────┐
  │ SP-① 入力の実データ化 │          │ SP-② 提示・運用の実装      │
  │  ・Channel3  (実装済) │          │  ・AG Studio (L5/監査UI) │
  │  ・Elastic    (L3照会)│          │  ・Render    (デプロイ)   │
  │  ・APIMatic   (開発時) │          │  ・Zapier    (通知)      │
  │  ・Postman    (開発時) │          │  ・Astropods (任意)      │
  └──────────────────────┘          └──────────────────────────┘
  ※ KERNEL / Bryntum は「刺さる場所が無い」＝ 入れない（§4）
```

### 1-4. ★「AI 部分（LLM）をスポンサーに置換すべきか」の技術判定 — **置換すべきでない**

技術的な理由を、コードの実事実から5つ:

**(1) 置換先が存在しない。**
Elastic Agent Builder / Astropods は「LLM そのもの」ではなく**LLM を載せるフレームワーク**。Elastic の docs（実測）: *"Agents combine **LLM reasoning** and context engineering with built-in and custom tools"*、*"**model-agnostic** across the major cloud providers' model services"*。つまり Elastic Agent Builder を使っても、下の `advocate`/`auditor`/`witness` は**結局どこかの LLM プロバイダを呼ぶ**。`DEFAULT_MODELS`（`deepseek-v4.1-flash` / `qwen3-vl:latest` / `llama4:latest`）は残る。置換ではなく「1層挟む」だけ。

**(2) TRIAD の中心価値「3体が独立」が壊れる。**
`runner.js` のコメント原文: *"Distinct models per role → genuinely independent adversaries. Three copies of the same model share the same blind spots, which defeats the adversarial design."*
Elastic Agent Builder に3体を載せると、実質**1つのフレームワーク・1つの推論ループ**を共有する → 独立性が薄まり、**審査項目 Innovation/Idea**（"does the project differ from existing concepts?") で自傷する。TRIAD の主張は「独立3体」なので、ここを共有基盤に寄せるのは本末転倒。

**(3) キー無しで動く保証が消える（足切りリスク）。**
`TriadRunner.live` は `Boolean(this.apiKey)`。キーが無ければ `deterministicReason` / `deterministicJudge` に落ちてデモは**必ず動く**。これは `demo/server.mjs` の起動ログ（`LLM: live | deterministic`）に現れ、README の "審査員がキー無しで必ず動かせる" の根拠。LLM をクラウドフレームワークに移すと、**14日トライアル失効後に動かない**デモになる危険がある（Elastic 14日 / Zapier 14日 / AG Grid 45日 / Bryntum 45日 = 審査期間 Dec 1–15 は締切から2週間以上後）。

**(4) L3 証跡層が壊れる。**
`receipt.js` は `a.advocate?.model` / `a.auditor?.model` / `a.witness?.model` を receipt に刻む。ここが `elastic-agent-builder:xxx` のような抽象名になると、`triadVerifyReceipt()` が返す「**どのモデルがどの票を投じたか**」という監査価値が薄まる。今は3つの具体モデル名が証跡に残る＝監査の解像度が高い。

**(5) 38日・週11-20h（80-110h）で新規フレームワークを学ぶ余白はない。**
Elastic Agent Builder の学習（ES|QL ツール作成、MCP/A2A 接続、スキル定義）は**丸2-3週間を食う**。しかも §3 の通り、その見返りは**加点項目ゼロ**（スポンサー5項目に Elastic は入っていない）。

> **判定**: LLM は**置換しない**。`runner.js` は現状のまま（Ollama Cloud 3モデル）。エフォートは §5 の弱点修正と §6 の最小セットへ回す。

---

## 2. 公式ルールの技術的解釈（PayPal の意図）

**問い**: 「スポンサーAPIを基本部分に組み込め」なのか「任意のネタとして提供」なのか。

**答え**: **後者（任意のネタ提供）**。ただし正確には「任意だが、使えば別枠の賞が取れる」という**二層構造**。原文から3点で確定する。

**(a) 意図の原文（R2）**:
> *"PayPal will provide access to select AI sponsor tools that entrants are **welcome to use**, though **using one of these partner tools is not required**. Any AI tool works, as long as PayPal integration is central to the project."*

技術的解釈:
- *"welcome to use"* = 推奨でも命令でもない、**歓迎**。
- *"not required"* = **必須ではない**と明示。
- *"Any AI tool works"* = **LLM はスポンサーでなくてよい**と明示。
- 従属節 *"as long as PayPal integration is central"* = **唯一の条件は PayPal が中央**。

→ 「基本部分にスポンサーを入れよ」という要求は**存在しない**。むしろ「PayPal を中央に」だけが条件。

**(b) なぜ二層構造か（ビジネス的意図の技術的読み）**:
PayPal は自社 API のハッカソン普及（required, Stage One で検査）と、スポンサー企業のツール普及（任意, 別賞で誘導）を**分離**している。§8 Prizes の表を見ると:
- `Eligible Submissions` 列が Grand/HM は *"All Eligible Submissions"*、スポンサー賞は *"All Eligible Submissions that **use any <Sponsor> tools**"*。
→ スポンサー利用は**提出の適格性（Stage One）に影響しない**。**賞の eligibility を増やすだけ**。

**(c) 帰結（設計方針）**:
1. Stage One を通す条件は **PayPal が central** であることだけ（TRIAD は `triadCreateOrder()` の Money Gate で満たす＝証明済み）。
2. スポンサーは **1つだけ**選んで本気で呼ぶ（R6: Grand/HM + Sponsor 1 の同時受賞が可能）。複数に薄く手を出すと、どのスポンサー審査員にも刺さらない。
3. 残りは「README に1行書く」だけでも、呼んでいなければ**書かない**（前回の失敗: 呼ばずに "used" と書くと、その会社の審査員に即バレする）。

---

## 3. ★各スポンサーを TRIAD に組み込む場合の具体的な配置

「基本部分」として入れられるものは**ない**（§1）。よって全部「機能パーツ」としてのみ配置する。**実装工数の単位: h（週11-20h制約）**。審査加点は**審査5項目**への寄与（◎大 / ○中 / △小 / ×なし）。

| スポンサー | どこに入るか（ファイル・関数） | 実装工数 | 審査加点 | 賞金枠 | 優先度 |
|---|---|---|---|---|---|
| **Channel3** | **既存 `src/channel3.js` `search()`**（実装済）/ `src/commerce.js triadShop()` の候補供給。実キー取得のみ | **1-2h**（キー取得＋疎通確認） | △（Design=実データで説得力UP） | $1,500 | **★★★ 最優先** |
| **AG Grid / AG Studio** | **`demo/index.html` を AG Studio に置換**。`ag-grid-community@31.3.4`（現行）→ AG Studio。監査台帳 `ledger[]` を Studio のデータソースに接続。Studio Agent Framework で「denied purchases over $200」を自然言語クエリ | **20-35h**（最大の山） | **◎**（Design 4→9, Presentation にも波及） | **$5,000/2,000/1,000×3** | **★★★ 本線** |
| **APIMatic** | **開発時のみ**。Claude Code に Context Plugin を入れ、`paypal/client.js` の実装を PayPal 文脈で書く。**成果物にコードは入らない**（README に1行） | **0.5-1h** | ×（審査5項目に直接加点なし） | **$1,000×3（枠が多い＝当たりやすい）** | **★★ 費用対効果最高** |
| **Render** | **`demo/server.mjs` を Render にデプロイ**（現状ローカルのみ）。`render.yaml` 追加。Workflows は使わなくてよい（"use any Render tools"） | **3-5h** | ○（Design/Presentation の "hosted demo URL" 要件を満たす） | credits $1,000/750/500（**現金でない**） | **★★** |
| **Postman** | **開発時のみ**。PayPal API コレクションを `tests/paypalSandbox.live.mjs` の検証に使う。README に1行 | **1-2h** | × | **なし**（賞金枠が §8 に無い） | **☆** |
| **Elastic** | **監査台帳の検索**に使う可能性はある（`ledger[]` を Elasticsearch に入れ ES|QL で照会）。ただし現行は JS 配列で十分 | 15-25h | △（Innovation には寄与しない） | **なし** | **☆ 入れない** |
| **Zapier** | **DENIED/DISSENT 発生時に Slack/メールへ通知**。Zapier MCP を `triadAdjudicate()` の後段に。14日トライアル→無料枠 | 4-6h | △（Presentation のデモに「通知が飛ぶ」1カット足せる） | **なし** | **☆** |
| **Astropods** | TRIAD 3体を `astropods.yml` の blueprint にしてデプロイ**しうるが**、§1-4 の通り LLM 独立性を損なう | 20-30h | △ | **なし** | **☆ 入れない** |
| **KERNEL** | 組み込む場所が**存在しない**（TRIAD はブラウザ自動操作をしない） | — | × | 賞金なし（$50クレジットのみ） | **×** |
| **Bryntum** | 組み込む場所が**存在しない**（TRIAD に時間軸スケジュールが無い）。無理に入れると Design が壊れる | — | ×（むしろ Design 減点） | $1,000×3 | **×** |

**推奨の組み合わせ（R6 の同時受賞を狙う形）**:
- **Grand/HM を狙う本線**: Channel3（実データ）+ AG Studio（Design 満点）+ APIMatic（無料・枠3）
- **保険**: Channel3 単独でも $1,500 が届く（既存実装なので追加コストほぼ0）

---

## 4. ★組み込むべきでないスポンサーと理由

| スポンサー | 判定 | 技術的理由（実コード・実仕様ベース） |
|---|---|---|
| **KERNEL** | **× 不採用** | TRIAD の動線は「カタログ検索 → 3体審理 → PayPal決済」。**ブラウザ自動操作が1箇所も無い**。KERNEL の価値（<30ms起動・bot検知回避・headful Chromium）を発揮する箇所が存在しない。しかも §8 Prizes に **KERNEL 賞が無い**（$50 クレジットのみ）。コードを足すほど Design が散らかる。 |
| **Bryntum** | **× 不採用** | Gantt/Scheduler/Calendar は「時間軸」製品向け。TRIAD の出力は `decision` / `dissentMap` / `receipt` で、**時間軸を持たない**。Bryntum の detail ページの例（"Agency delivery board" 等）は全て**プロジェクト管理/予約**が主題で TRIAD と題材が違う。無理に入れると「審査員に不自然に映る」＝ Design と Innovation を同時に削る。枠は3つあるが、賞金は**その会社の審査員が入れる**ので、不自然な利用は逆効果。 |
| **Elastic** | **× 不採用（現時点）** | §3 の通り、入れられる場所は「監査台帳の検索」だけ。現行 `ledger[]` は JS 配列で、**50件程度なら Elasticsearch を挟む理由が無い**（過剰複雑化＝ボスの「シンプル」厳命に反する）。加えて §8 に **Elastic 賞が無い**。14日トライアルは審査期間（Dec 1-15）に失効する。**唯一の例外**: AG Studio の監査UIに載せる検索バックエンドとしてなら Design に寄与するが、優先度は AG Studio 本体より低い。 |
| **Astropods** | **× 不採用** | 最も誘惑が強いが最も危険。①LLM を Astropods blueprint にすると §1-4(2) の独立性が壊れる。②`astropods.yml` + Docker + CLI（`ast project create`/`blueprint push`/`blueprint deploy`）の学習に20-30h。③**§8 に Astropods 賞が無い**。④現行 `demo/server.mjs` は依存ゼロで完結しており、置換する技術的必要が無い。 |
| **Zapier** | **× 不採用（優先度最低）** | 通知は「あれば見栄えする」レベルで、審査5項目への加点が小さい。**§8 に賞金枠が無い**（14日Pro特典のみ）。14日トライアルは審査期間に失効。ただし工数4-6hと軽いので、**全部終わって余ったら足す**程度。 |
| **Postman** | **△ 任意** | 開発補助として有効（PayPal コレクションで REST を検証）だが、**成果物に入らない・賞金枠が無い**。README に1行書くだけなら1-2hで済むので「ついで」でよい。 |

**「入れない」判断の一般則**（ボスの判断基準として残す）:
> **① 賞金枠が §8 に無いスポンサーは、入れるだけ損。**
> **② TRIAD の動線（カタログ→審理→PayPal）に物理的に刺さらないツールは、無理に入れると Design が落ちる。**
> **③ 学習コスト > 20h のものは、38日の予算（80-110h）では入れない。**

---

## 5. TRIAD の現状アーキテクチャの弱点（技術的に直すべき点）

実コードを読んで見つけた、**審査に効く順**の弱点。いずれも「スポンサーを入れなくても直る」もの。

| # | 弱点（実コードの該当箇所） | 影響する審査項目 | 修正（具体的にどこへ何を書くか） | 工数 |
|---|---|---|---|---|
| **W1** | **`demo/index.html` が PoC に見える**。AG Grid の表2枚だけ。"not just a technical proof of concept" に正面から反する | **Design**（最大の弱点） | AG Studio へ置換（§3）。加えて「Trust Receipt 1枚」（決定・金額・3票・争点・人間の最終ボタン）を中央固定 | 20-35h |
| **W2** | **`dissentMap` が文章のまま**。`buildDissentMap()` は `summary` 文字列と `entries[]` を返すが、**画面には文字で出るだけ** | **Design / Innovation** | `buildDissentMap()` の出力を SVG の3ノード対立グラフに描く（`demo/index.html` に `<svg id="dissentMap">` を追加、`d.triadAdjudicate()` のレスポンスから描画） | 6-10h |
| **W3** | **LLM 3体が同じ `_chat()` を通る**（`runner.js` L43-63）。3社別モデルだが**プロバイダは1つ（Ollama Cloud）** | Innovation（"genuinely independent"の説得力） | 既に `TRIAD_MODEL_<ROLE>` でモデルは別。**プロバイダも別にする**なら `LLM_ENDPOINT_<ROLE>` を追加（例: advocate=Ollama, auditor=別プロバイダ）。**任意**。現状でも "distinct models" は成立 | 2-4h |
| **W4** | **タイムスタンプが receipt に含まれる**（`receipt.js` L85 `at: new Date().toISOString()`）。`verifyReceipt()` は保存済み receipt を再ハッシュするので**照合は通る**が、**同じ決定を2回作ると別ハッシュ**になる | Innovation（"tamper-evident"の説明） | README で「receipt は決定の**スナップショット**であり、同一決定の再現は同一ハッシュにならない」と明記。あるいは `at` を除外した「決定指紋」と「receipt ハッシュ」を分離（**やらなくてよい**、複雑化） | 0-1h |
| **W5** | **`pendingOrders` がメモリ Map**（`webmcp.js` L33）。**サーバ再起動で消える**。`triadVerifyReceipt()` は `pendingOrders` を探すので、再起動後は `receipt_not_found` | Technological Implementation（"working, non-trivial"） | `ledger` と `pendingOrders` を JSON ファイルに永続化（`demo/server.mjs` に `fs.writeFile` を追加）。**デモは1セッションで完結するので優先度低** | 3-5h |
| **W6** | **ローカルのみ**（`demo/server.mjs` port 8787）。審査員は `node demo/server.mjs` を叩く必要がある | Presentation / Design | Render にデプロイ（§3）。hosted demo URL を README に載せる | 3-5h |
| **W7** | **`triadShop()` が候補を最大5件ループ**（`commerce.js` L32）。各候補で `triadAdjudicate()`（= LLM 3回）を呼ぶ → **最大15回の LLM 呼び出し**。Ollama Cloud では**数十秒**かかる | Presentation（デモが遅いと「動いている」感が損なわれる） | ①`triadShop()` に**実測タイマー**を出し「adjudication took 4.2s」と画面表示（Impact にも効く）。②候補を3件に絞る。③LLM 呼び出しに `AbortController` でタイムアウト | 3-5h |

**W3・W5・W7 は「やらなくても落ちない」**。優先は **W1 → W2 → W6 → W7 → W3 → W5**。W4 は README 1行。

---

## 6. 38日で実装すべき最小セット（工数順）

**前提**: 残り38日・週11-20h = **約80-110h**。全部は無理。**「デモ動画に映る動線」だけ**を作る。ボスの「シンプル、シンプル、シンプル」厳命に従い、**新規依存を増やさない**。

### 最小セット（合計 約52-77h）

| 順 | タスク | 具体ファイル・関数 | 工数 | 何の審査項目に効くか | スポンサー賞との関係 |
|---|---|---|---|---|---|
| **1** | **Channel3 実キー取得＋疎通** | `CHANNEL3_API_KEY` を env に。`src/channel3.js` は**既に実装済**。`node tests/channel3.live.mjs` を通す | **1-2h** | Design（実データ） | **Channel3 $1,500 の eligibility 確定** |
| **2** | **README 全面改稿（英文）** | Problem / Solution / PayPal usage / Setup / License。§2 の1文（PayPal central）を冒頭に | **4-6h** | Impact / Innovation / Presentation すべて | — |
| **3** | **APIMatic Context Plugin を使う** | Claude Code に PayPal Context Plugin を入れるだけ。README に1行 | **0.5-1h** | （直接加点なし） | **APIMatic $1,000×3 の eligibility 確定** |
| **4** | **Dissent Map の SVG 可視化（W2）** | `demo/index.html` に `<svg id="dissentMap">` 追加。`buildDissentMap()` の `entries[]` を3ノードで描画 | **6-10h** | **Design / Innovation** | — |
| **5** | **Trust Receipt 1枚画面** | `demo/index.html` に receipt パネル。`triadAdjudicate()` の `result.receipt`（`hash`/`customId`/`votes`/`models`）を表示＋人間の最終ボタン | **8-12h** | **Design（最大の弱点）** | — |
| **6** | **Render にデプロイ（W6）** | `render.yaml` 追加、`demo/server.mjs` をそのまま。README に hosted URL | **3-5h** | Presentation | **Render credits の eligibility** |
| **7** | **AG Studio へ置換（W1）** | `demo/index.html`。`paypaldev/hackathon-paypal-ag-grid-boilerplate` を出発点に。`ledger[]` を Studio のデータソースに | **20-30h** | **Design（4→9）/ Presentation** | **AG Grid $5,000/2,000/1,000×3 の eligibility** |
| **8** | **3分動画（実機・英語）** | TRIAD の実画面を録画。0:00問題 → 議論 → Dissent Map → PayPal custom_id → 人間の決定 | **8-12h** | **Presentation（5→10）** | 全スポンサー賞の前提（動画に映らないと審査員は見ない） |

### 実装しないと決めたもの（明示）

| やらないこと | 理由 |
|---|---|
| LLM を Elastic Agent Builder / Astropods に置換 | §1-4。加点ゼロ・独立性喪失・学習20-30h |
| KERNEL の組み込み | 刺さる場所が無い・賞金枠なし |
| Bryntum の組み込み | 時間軸が無い・Design が落ちる・賞金枠はあるが不自然 |
| Zapier MCP の組み込み | 賞金枠なし・14日失効・Effect 小（余ったら最後に4-6h） |
| Elasticsearch の導入 | 50件の台帳に過剰・賞金枠なし |
| Store Sync / ACP（delegated payment token）の実装 | Braintree 前提で重い。**README での正確な言及**に留める（実装しない） |

### クリティカルパス（この順に依存）

```
[1 Channel3キー] ─┐
[3 APIMatic]    ─┼─→ [2 README] ─→ [8 動画] ─→ 11/11 提出
[4 Dissent Map] ─┤
[5 Receipt画面] ─┼─→ [7 AG Studio] ─→ [6 Render deploy] ─┘
```

**締切**: 2026-11-13 07:00 JST。**11/11 に提出完了**（1.5日バッファ）。動画と README だけでも Design 以外の4項目は上がる。AG Studio が間に合わなければ **Channel3 $1,500 に切り替え**（既存実装で当たる）。

---

## 付録: 本分析の証拠の所在

- 公式ルール全文（R1-R7 の引用元）: `paypalaihackathon.devpost.com/rules`（2026-10-06 実測、全文キャッシュあり）
- 各スポンサーの提供物: `paypalaihackathon.devpost.com/details/{aggrid,elastic,channel3,render,apimatic,zapier,kernel,bryntum,postman,astropods}`（2026-10-06 実測）
- Elastic Agent Builder の仕様: `elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder`（model-agnostic / MCP / A2A）
- Astropods の仕様: `docs.astropods.com/welcome`、`astropods.com/builders`（`astropods.yml` / `ast blueprint push` / Docker 前提）
- TRIAD 実コード: `src/triad.js`(268行) / `src/runner.js`(138行) / `src/receipt.js`(110行) / `src/webmcp.js`(268行) / `src/channel3.js`(124行) / `src/commerce.js`(104行) / `paypal/client.js`(137行) / `demo/server.mjs`(83行) / `demo/index.html`(324行) / `package.json`（依存ゼロ）
