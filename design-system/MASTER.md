# CIQ Design System — MASTER (Global Source of Truth)

> 2026-07 全面再設計。このファイルが全ページ・全コンポーネント・HTMLメールの唯一の設計根拠。
> ページ固有の逸脱は `design-system/pages/<page>.md` に置き、存在する場合のみ MASTER を上書きする。

---

## 1. サービス目的の再定義

**CIQ は「ペーパークイズ大会の運営を、エントリー受付から成績返却まで一人でも回せるようにする採点オペレーション基盤」である。**

- 提供価値は「速い採点」ではなく **「ミスが起きない運営」**。誤採点・誤公開・個人情報漏えい・当日の行列という4大事故を構造的に防ぐ。
- ブラウザだけで完結（静的HTML + Supabase）。インストール不要は会場運営での絶対条件。
- 紙の答案という物理世界と、リアルタイム集計というデジタルを ArUco スキャンで接続する。

### プロダクト原則（全設計判断の優先順位）
1. **Never lose an answer** — 答案・採点データの完全性が最優先
2. **Calm operations** — 本番中の運営者を慌てさせない。次の一手が常に見える
3. **Respect the contestant** — 参加者(多くは中高生)に対して誠実・簡潔・励まし
4. **Private by default** — 個人情報・答案画像は公開面に一切出さない

## 2. ターゲットユーザー分析 / 3. ペルソナ

| ペルソナ | 状況 | 成功の定義 |
|---|---|---|
| **主催者・蒼井(大学生)** | 年1回の大会を少人数で運営。PC作業はできるが本番中は極度に忙しい | 「今どこまで終わっていて、次に何をすべきか」が3秒でわかる |
| **採点者・北村(社会人OB)** | 当日だけ手伝う。スマホ/ノートPC。操作説明を受ける時間はない | 自分の担当問題を迷わず選び、二重採点せず、確実に送信できる |
| **参加者・南(高校2年)** | スマホでエントリー。大会は初参加で緊張している | 受付番号とQRを確実に受け取り、当日スムーズに入場し、成績を気持ちよく確認できる |
| **受付スタッフ・西田(部員)** | 会場入口でタブレット担当。列を止められない | 数メートル先からでも受付結果が判別でき、例外時の案内文言に迷わない |

## 4. JTBD

- 主催者: 「大会本番という一発勝負の日に、**採点と名簿の正しさを疑わずに済む状態**を雇いたい」
- 採点者: 「短い拘束時間の中で、**自分の作業が完了した確信**を雇いたい」
- 参加者: 「**ちゃんとエントリーできたという証拠**と、**努力の結果が返ってくる体験**を雇いたい」
- 受付: 「**列を止めない即時判定**を雇いたい」

## 5. CX設計（利用前〜利用後）

| フェーズ | 接点 | 感情目標 | 設計 |
|---|---|---|---|
| 認知 | 案内リンク/QR | 「ちゃんとした大会だ」 | エントリーページ最上部に大会名を主役として表示。CIQは黒衣(footer) |
| エントリー | entry.html + メール | 安心・完了の確信 | 3ステップ表示、受付番号の巨大表示、メール保存の強い案内 |
| 待機 | 控えメール/entry_list | 期待感 | メールがサイトと同一ブランド。エントリーリストで仲間が見える |
| 当日 | checkin | スムーズな入場 | 全画面判定色 + アイコン + 文言。例外時の案内文まで表示 |
| 競技後 | disclosure | 高揚・誇り | スコアを祝祭的に表示、SNS共有カード |
| 運営後 | admin集計/CSV | 達成感・信頼 | 全問確定チェック → 出力。「未確定あり」を明示し誤公開を防ぐ |

## 6. ユーザージャーニー / 9. ユーザーフロー

```
主催者:  index → create(Google認証→回数入力→資格情報保管) → admin
         admin: [参加者] 公開設定→リンク配布 → [採点準備] PDF生成/模範解答
                → [答案管理] スキャン取込 → judge/conflict 監視 → [集計] 照会公開/CSV
採点者:  index(ID+パスワード) → judge(担当選択) → question(採点) → judge …繰り返し
参加者:  entry(①メール認証→②入力→③完了) → 控えメール → (edit/cancel/late)
         → 当日QR提示 → disclosure(メール+パスワード → 成績)
受付:    checkin(カメラ許可 → 連続スキャン → 例外対応)
```

## 7. 情報設計(IA) / 8. サイトマップ

**2つの世界を明確に分離する。**

```
CIQ
├─ 運営面 (Ops) ── 認証必須・データ密度高・ダークモード対応
│   ├─ index.html    入室(採点者参加 / プロジェクト選択)
│   ├─ create.html   プロジェクト作成
│   ├─ admin.html    運営コックピット(参加者/採点準備/答案管理/集計/設定)
│   ├─ judge.html    問題ステータスボード
│   ├─ question.html 採点ワークベンチ(全画面)
│   ├─ conflict.html 要確認レビュー
│   ├─ checkin.html  当日受付(全画面判定)
│   └─ help.html     運営ヘルプ
└─ 参加者面 (Contestant) ── 公開・大会名が主役・単一カラム・モバイル最優先
    ├─ entry.html / edit.html / cancel.html / late.html
    ├─ entry_list.html / disclosure.html / terms.html
    └─ 404.html
```

- URLとクエリパラメータは既存を完全維持（配布済みリンク・メール内リンクを壊さない）。

## 10. ページ構成 / 11. ナビゲーション設計

- **Opsシェル**: 上部アプリバー(戻る/ページ名/状態/メニュー)。メニューはスライドパネルで「運営」「ツール」「参加者ページ(外部を開く)」「サポート/退出」をグループ化。管理画面はフェーズナビ(サイドバー)＋状態サマリーバー。
- **参加者シェル**: 大会名ヘッダー → 主コンテンツカード → フッター(参加規約/Powered by CIQ)。ナビは意図的に置かない(1ページ=1タスク、離脱要因を排除)。
- **entry.html は3ステップ表示**: ①本人確認 → ②情報入力 → ③完了。CSS `:has()` でJS変更なしに現在ステップを強調。
- 危険操作(キャンセル/リセット)は影響範囲を操作前に明記し、danger色はこの用途のみに使用。

## 12. デザインコンセプト

**「Calm Command / 知の競技場」**
運営には管制室の静かな正確さを、参加者には競技の高揚を。同一トークンの2つの声色で表現する。

- 旧デザイン(ネイビー+スカイブルー+Inter/Noto)は全廃。
- 新ブランドカラーは **Regatta Blue(青紺)** — 競技運営・採点基盤らしい信頼感と集中を持つ色。採点の正誤(緑/赤)や警告(琥珀)と決して衝突しない。
- スコア・受付番号・ID・コードは **IBM Plex Mono** で「計測された正確な数字」として表現。これがCIQの視覚署名。

## 13-15. デザインシステム / CSS設計方針 / デザイントークン

### アーキテクチャ
- `css/design_system.css` … トークン + リセット + 共通コンポーネント(全ページ共有)
- `css/pages.css` … シェル(Ops/参加者)とページ固有コンポーネント
- 場当たりCSS禁止。**全463クラスの語彙(HTML/JSが参照)をコンポーネントAPIとして維持**し、実装のみ全面刷新。
- 命名: 既存語彙を尊重しつつ、新規は `c-`(component) / `u-`(utility) / `is-`(state)。

### Color Tokens（light / dark 両対応、`prefers-color-scheme`）
```
--canvas #F6F6FA / #12121D     --surface #FFFFFF / #1B1B2C
--surface-2 #F1F0F7 / #232338  --ink #191827 / #EDEDF6
--ink-2 #55536B / #A7A5C0      --ink-3 #8B89A3 / #6F6D8A
--line #E5E4F0 / #2C2B44       --line-strong #C9C7DC / #3E3D5C
--brand-50 #EFF6FF  --brand-100 #DBEAFE  --brand-500 #2563EB
--brand-600 #1D4ED8 --brand-700 #1E3A8A  (dark: text用 --brand-600 #93C5FD)
--ok-600 #187A41  --ok-100 #DFF5E8   (dark #2FBF6B / #12301F)
--warn-600 #A05A00 --warn-100 #FDEED3 (dark #F0A73E / #33260F)
--bad-600 #C22945 --bad-100 #FCE7EB  (dark #F26D85 / #3A1520)
--gold-600 #9A6A00 --gold-400 #E8A317 (スコア・順位の祝祭色)
--focus-ring 0 0 0 3px color-mix(brand-500 35%)
```
コントラスト: 本文 4.5:1 以上、状態色はテキスト用600番台を使用。**状態は色+アイコン+文言の複合で伝達（色のみ禁止）**。

### Typography Scale
- Family: `"IBM Plex Sans JP", "Hiragino Sans", "Noto Sans JP", sans-serif` / 数値: `"IBM Plex Mono", monospace`
- Weights: 400 / 500 / 600 / 700。数字は `font-variant-numeric: tabular-nums`。
- Scale(px): 12, 13, 14, 15(ops基準), 16(参加者基準), 18, 21, 26, 32, 40(受付番号/スコア), 56(checkin判定)
- Line-height: 見出し1.3 / 本文1.7 / 数値表示1.1。Letter-spacing: 見出し-0.015em、英字ラベル+0.08em(uppercase)。

### Spacing / Radius / Shadow / Border / Z-index / Breakpoints / Grid
- Space: 4px基数 `--sp-1..--sp-12` (4,8,12,16,20,24,32,40,48,64,80,96)
- Radius: `--r-sm 8px --r-md 12px --r-lg 16px --r-xl 24px --r-full 999px`
- Shadow: `--sh-1`(hairline+2px) `--sh-2`(カード8px) `--sh-3`(オーバーレイ24px) — 全て低彩度インク色
- Border: 1px `--line`、強調 `--line-strong`、入力フォーカスは border-color: brand + focus-ring
- Z: content 0 / sticky 10 / appbar 20 / dropdown 30 / drawer 40 / modal 50 / toast 60 / overlay-max 70
- Breakpoints: 480 / 768 / 1024 / 1280。コンテナ: 参加者 640px(リスト960px) / Ops 1280px / 12カラム相当のCSS Grid
- Touch target: 44px 最小。`cursor:pointer` を全インタラクティブ要素へ。

### Component Variants / States
全コンポーネントに hover / focus-visible / active / disabled / error / success / loading を定義:
- **Button** `.btn`(primary) `.secondary` `.ghost` `.danger` `.cta` `.standard` + `.is-loading`(スピナー) + disabled
- **Card** `.card` `.page-card`(参加者) `.section`(ops) — glass-panelはフラット面として再定義
- **Form** input/textarea/select + `.custom-select` `.custom-checkbox` `.choice-option` `.toggle-switch` `.number-spinner-wrap` + エラー時 `:user-invalid`
- **Table** `.table-container`(sticky header, 横スクロール, 行hover)
- **Status** `.status-pill (success|warning|danger|info|neutral)` `.status-badge (open|closed|warning)` `.q-status (open|inprogress|done|locked)`
- **Feedback** `.toast (info|success|error|warning)` `.page-msg` `.empty-state` `.error-state` `.loading-state` `.skeleton` `.save-overlay` `.progress-p-0..100`
- **Overlay** `.menu-panel`(drawer) `.modal-backdrop` `.confirm-overlay` `.preview-overlay` `.dt-picker`
- Motion: micro 150ms / enter 220ms / drawer 280ms、`cubic-bezier(.2,.8,.2,1)`。`prefers-reduced-motion` で全停止。

## 16-17. 共通コンポーネント / UI設計
実装は `css/design_system.css` を正とする。アイコンは自作SVGシステム(`js/icons.js`)のみ。絵文字アイコン禁止。

## 18. レスポンシブ設計
- 375px を最低保証。表: 参加者リストは768px未満でカード化、adminテーブルは横スクロール+スクロールヒント。
- question/checkin はモバイル時に下部固定アクションバー(セーフエリア対応 `env(safe-area-inset-bottom)`)。
- admin サイドバーは1024px未満で上部水平フェーズナビに変形。

## 19. アクセシビリティ設計
- コントラスト AA(本文4.5:1)以上。focus-visible 3pxリング全要素。tablist/tabpanel・role/aria-live は既存構造を維持強化。
- 状態=色+アイコン+テキスト。キーボード: 採点(M/X/H/←→)ヒント表示。`prefers-reduced-motion` / `prefers-color-scheme` 対応。

## 20. HTMLメール設計
- サイトと同一トークン(Regatta Blue/インク/紙色、状態色)。**600px テーブルレイアウト+インラインCSS**、Outlook対応(MSOフォールバック)、ダークモード(`color-scheme: light dark` + 暗所でも破綻しない配色)。
- 構造: ブランドバー(ロゴタイプ「CIQ」+大会名) → タイトル → 状態パネル → 詳細テーブル(受付番号はPlex Mono系フォールバックで大きく) → QR → CTAボタン(ブランド色) → フッター(自動送信注記)。
- 件名は既存を維持(【大会名】…)。text版も併送(既存機構)。

## 21-22. コード変更方針
- ルート/クエリ/ID/JS参照クラスは維持。CSS全面書換 + HTML構造刷新 + メールテンプレ刷新。
- フォント読込を IBM Plex Sans JP / IBM Plex Mono に変更(全ページ`<head>`)。
- キャッシュバスター更新: design_system.css?v=24, pages.css?v=38。
- 不変条件: 静的構成 / Supabase / CSP / textContent 方針 / RLS前提 を全て保持。
