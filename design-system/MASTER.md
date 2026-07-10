# CIQ Design System — MASTER (Global Source of Truth)

> 2026-07 Apple UI/UX 全面刷新(v4・承認済み)。このファイルが全ページ・全コンポーネント・HTMLメールの唯一の設計根拠。

---

## 1. サービス定義

**CIQ は、クイズ大会における「紙に関わる運営業務」を一気通貫で支援するプロダクトである。**
対象: エントリー受付 → 当日受付(QR) → 解答用紙PDF → 答案スキャン → 複数採点者による採点と不一致解決 → 集計・成績照会・記録出力。
提供価値は「誤採点・誤公開・受付の滞留・個人情報漏えいを構造的に防ぐこと」。

コピー: 「クイズ大会のペーパー運営を、エントリーから成績返却まで。」
(「紙のクイズ大会」という表現は使わない)

### プロダクト原則
1. **Never lose an answer** — 答案・採点データの完全性が最優先
2. **Calm operations** — 次の一手が常に見える。本番中の運営者を慌てさせない
3. **Respect the contestant** — 参加者(多くは中高生)に誠実・簡潔
4. **Private by default** — 個人情報・答案画像は公開面に出さない

## 2. サイトマップ / IA

```
入口       index.html(採点者参加・プロジェクト選択 / #create で作成モード)
運営(認証)  admin(フェーズタイムライン) / judge(採点ボード) / question / conflict / checkin / help
参加者(公開) entry / my(マイエントリー・ハブ) / entry_list / terms / 404
削除済み    create.html(index統合) / edit・cancel・late・disclosure.html(my統合・互換なし)
```

- プロジェクト作成は `index.html#create` のみ。参加者ページから作成導線には到達できない。
  作成ゲートは `canCreateProject()`(js/index.js)の1点 — 将来の招待コード/許可ユーザー制の差し込み口。
- 参加者のセルフ操作(確認/QR/編集/遅刻/成績/キャンセル)は my.html に集約。認証は1回。
- 共有リンクは4本(エントリー/リスト/マイエントリー/規約)。QRは当日受付専用で
  「確認メール・my.html・代理エントリー控え」の3箇所にのみ存在する。

## 3. 参加者認証(my.html)

- `my-entry` Edge Function: ハッシュ照合 or **短命署名トークン**(HMAC, TTL30分, 操作ごとスライド延長)。
- トークンとメールアドレスは **sessionStorage**(タブクローズで消滅・共有端末配慮)。
  **パスワード平文/ハッシュ・復号PIIはいかなるストレージにも保存しない**。ログアウト導線常設。
- 総当たり対策: `participant_auth_events` テーブルで失敗回数を10分窓で制限。
- QRはメールと同一データ(entry.id)・同一生成器(`_shared/qr.ts`)なので受付でそのまま読める。

## 4. 各画面の主役と次の行動

| 画面 | 最初に見る情報 | 次の行動 |
|---|---|---|
| index | CIQが何か(タグライン) | 役割に応じて入室 |
| admin | 現在フェーズ(タイムライン) | 開いているフェーズの主ボタン |
| judge | 続きから採点する | 1タップで再開 / 空き問題 |
| question | 問題番号+模範解答 | M/X/H で判定 |
| checkin | カメラ(かざす枠)と判定 | かざすだけ・連続処理 |
| entry | 大会名+現在ステップ | 常に1つのボタン |
| my | 受付番号+QR | 目的の1操作(編集/遅刻/成績/キャンセル) |
| entry_list | ◯名がエントリー(定員) | 自分の枠・出場圏内を確認 |

## 5. ビジュアル方針 — Apple方向の白・黒・グレー

紫・青紫・グラデーション・グロー・ガラス風・ネオン・カード乱用・アイコン過多・影の多用は**禁止**。
装飾ではなく、余白・罫線・タイポグラフィ・階層で見せる。1画面1主役。CTAは少数精鋭。

### 用途別ハイブリッド

- 公開・参加者画面は Apple.com のように静かな余白、強い見出し、単一の主操作で迷わせない。
- 運営・採点画面は macOS / iPadOS のように情報密度と操作効率を優先し、状態と次の操作を同時に把握できる構成とする。
- 両者は同じトークン、フォーム、状態、フォーカスの契約を共有する。Liquid Glass は採用せず、不透明な面と hairline で階層を作る。

### Color Tokens(light / dark, `prefers-color-scheme`)
```
Background  #FFFFFF / #000000        Surface-2  #F5F5F7 / #2C2C2E
Text        #1D1D1F / #F5F5F7        Sub        #6E6E73 / #AEAEB2
Border      #E5E5EA / #38383A        強調線     #D2D2D7 / #48484A
Primary     #1D1D1F / #F5F5F7        — 主CTAのみ(白黒を維持)
Apple Blue #0066CC / #2997FF        — リンク・選択・フォーカスのみ。面では広く塗らない
Accent Soft #F5F9FF / #071D33       — 選択状態の背景のみ。強い青面を避ける
Switch On #34C759 / #30D158         — iOS/macOS標準に合わせ、トグルONのみ緑
Success #248A3D / Warning #BF6A02 / Destructive #D70015 — 状態表示限定・面塗り最小(左罫+文字中心)
On semantic #FFFFFF / #000000 — 状態色を面に使う場合の前景色
Gold #A05A00 / #FFD60A — 成績・順位の1点のみ
```

- `ink-2` を意味のある補足文とplaceholderに使う。`ink-3` は disabled、装飾、非主要アイコンに限定する。
- 状態は色だけで伝えず、テキスト、アイコン、罫線のいずれかを必ず併用する。

### Typography(Webフォント読込なし・Apple system stack)
```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
             "Helvetica Neue", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
             "Yu Gothic", "Noto Sans JP", sans-serif;              /* 見出し */
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue",
             "Hiragino Sans", "Hiragino Kaku Gothic ProN",
             "Yu Gothic", "Noto Sans JP", sans-serif;              /* 本文 */
font-family: ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace; /* 数値専用 */
```
- H1 26–32px/700(1画面1つ) / H2 18–24px/600 / H3 16–22px/600(H4以下は使わない)
- **LP/公開画面のヒーローは例外**: `.hero-title`(`clamp(2.5rem, 7vw, 4.5rem)` / `letter-spacing: -0.022em`) と
  `.hero-subtitle`(`clamp(1.125rem, 2.5vw, 1.5rem)`) を `design_system.css` に共有コンポーネントとして持つ。
  H1のサイズ制約は管理画面の本文H1に適用し、ヒーローは独立クラスで Apple.com の強い見出しを再現する。
  適用範囲は index / entry / 404 等の入口・LP 限定。運営・採点画面では使わない。
- 本文 16px/400/lh1.7、補足 13px/400/Sub色、ボタン 15px/500–600、フォーム入力 ≥16px
- テーブル: セル14px、ヘッダ12px/600/+0.06em
- Canvas生成画像も同じApple stackを使い、`IBM Plex` / `Inter` などの外部フォント前提にしない。
- **mono は数値・ID専用**(受付番号、スコア、判定 No.、ID・コード、`tabular-nums`)。本文・見出し禁止
- 優先順位はサイズではなく余白・ウェイト・濃淡で。見出し前の余白は後ろの2倍

### Radius / Elevation / Motion / Layout
- 角丸 6/8/10/12px。意味別に control=8px / grouped surface=10px / overlay=12px / pill=999px とする。
- 面は plain section / grouped surface / overlay の3役に限定する。Grouped list は単一の外枠と行間の hairline で構成し、行ごとの入れ子カードを作らない。
- 影は実質廃止(`--sh-3`のオーバーレイのみ)。区切りは1px罫線と余白で表す。
- Motion 150–250ms fade/slide のみ。`prefers-reduced-motion` 全停止
- 幅: ログイン・本人確認・フォーム・ヘルプ/規約本文は集中できる狭幅(概ね520〜840px)を維持する。admin、一覧、管理表、答案、集計、採点ボード、チェックインなど作業面は1600pxまで広げる。ただし1600px未満の画面でも端ギリギリにはせず、wide系は左右に十分なgutterを取る。タッチターゲット44px。フォーカスリング3px
- Z: sticky10 / appbar20 / dropdown30 / drawer40 / modal50 / toast60 / max70

### Accessibility

- 全ての操作はキーボードで到達・実行でき、見た目が小さい操作もヒット領域を44px以上にする。
- フォーカスは Apple Blue の3px outline + 2px offset。複合入力は `:focus-within` でグループの焦点も示す。
- 本文は4.5:1以上、非テキストとフォーカスは3:1以上を維持する。意味のある補足に低コントラスト色を使わない。
- `prefers-reduced-motion: reduce`、`prefers-contrast: more`、`forced-colors: active` に対応し、200%ズームで情報や操作を欠落させない。

### Icons
- Web上ではSF Symbols本体を同梱しない。`js/icons.js` は既存のCIQ論理名をLucide SVGへ解決するアダプタとする。
- HTML/JSからは `createIcon('trash')` / `data-icon="trash"` のようなCIQ論理名だけを使い、Lucideの実名は `ICON_ALIASES` に閉じ込める。
- Lucideは必要なSVG node dataだけをローカルにバンドルし、ランタイムCDNへ依存しない。ライセンスは `assets/vendor/lucide/LICENSE` に保持する。
- 新しいアイコンが必要な場合はLucideから対応名を選び、`ICON_ALIASES` とバンドル済みnode dataを同期する。`currentColor` / `fill="none"` / `stroke-width="2"` / `round cap+join` を維持する。
- 欠落アイコンを `circle-question` のまま放置しない。四角表示・途切れ・異なる太さを見つけたらレジストリ側で直す。

## 6. 運営共通シェル

- 全運営ページ同一のアプリバー(戻る / 大会名+現在位置 / メニュー)とドロワー。
- **ロール別**: 戻る先は管理者→admin、採点者→judge(`opsBackTarget()`)。ドロワー項目もロールで出し分け。
  権限のないページへの導線は表示しない。
- 集中モード(question/checkin): バー縮小・メニュー非表示。ただし現在位置と戻りは常に見える。

## 7. HTMLメール

- サイトと同一トークン(白ボディ・near-black見出し・neutral罫線・白黒の主CTA・Apple Blueのリンク)。600pxテーブル+インラインCSS。
- 基本CTAは[マイエントリー]に集約。エントリー完了メールのみ[マイエントリー]と[エントリーリスト]を横並びで置く。キャンセル完了はCTAなし。
- エントリー完了メールに必須: 受付番号(mono大) / 当日受付QR / パスワード / マイエントリーCTA /
  保存文言「このメールには受付QRとマイエントリー用の情報が含まれます。大会当日まで保存してください。」
  +「QRコードはマイエントリーからも再表示できます」。
- 状態パネルは面塗りせず左罫3px+状態色文字。

## 8. 実装アーキテクチャ

- `css/design_system.css` = トークン+共通コンポーネント / `css/pages.css` = シェル+ページ固有。場当たりCSS禁止。
- クラス語彙はJSが参照するコンポーネントAPI。変更はJSと同期して行う。
- Edge Functions: `my-entry`(新設) / `_shared/participant_auth.ts`(トークン・レート制限) /
  edit-entry・cancel-entry・mark-late・disclose-result(トークン経路追加) / send-email(再設計)。
- 不変条件: 静的HTML+vanilla JS+Supabase / CSP / textContent方針 / RLS前提 / DB変更はマイグレーション。

### CSS Ownership

- `css/design_system.css` owns generic UI: buttons, cards, form controls, badges, messages, steps, definition lists, modals, tables, empty/loading states, workbench cards, scoring controls, and touch/focus behavior.
- 小規模な選択は実体としての `<select>` を保持しつつ、共有JSでApple風のカスタムselect表示にenhanceする。元selectの `change` 契約、required、フォーム値は維持する。
- `css/pages.css` may only define page shells, page layout, content typography, and workflow exceptions that cannot be expressed as a shared component variant.
- Allowed page-specific exceptions include: index/login composition, admin phase layout, entry list responsive layout, terms Markdown article layout, check-in camera/result workflow, answer-prep PDF tooling, and one-off spacing overrides around shared components.
- If a page-specific class starts looking reusable across two pages, promote it to `css/design_system.css` before adding a second definition.
- Page-specific overrides must use design tokens and must not introduce new colors, shadows, gradients, radii, or button/message variants.
