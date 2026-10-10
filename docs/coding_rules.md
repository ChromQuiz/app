# Coding Rules

## JavaScript

- Use plain browser JavaScript.
- Keep page logic in the matching `js/<page>.js` file.
- Put reusable Supabase calls in `js/supabase_api.js`.
- Prefer `const` and `let`.
- Keep helpers small and named by behavior.
- Avoid global state unless the surrounding page already uses it.

## Rendering

- Build DOM nodes with `document.createElement`.
- Use `textContent` for variable text.
- Do not introduce raw `innerHTML` for user or database content.
- Reuse shared helpers in `js/ui.js`, `js/shared.js`, and page-local render helpers.

## CSS

- Reuse `css/design_system.css` tokens and utility classes.
- Put page-specific rules in `css/pages.css`.
- Do not add inline `style` attributes or JS `element.style` mutations.
- Keep colors and states consistent across entry, disclosure, admin, judge, and conflict pages.

## Naming

- HTML ids should describe page-local UI elements.
- JS page files should match HTML entry points.
- Tests use `*.test.mjs`.
- Migrations use timestamped descriptive names.

## Notifications

- 操作の結果(保存した・失敗した・入力の誤り)は、`showToast`(運営画面では `showAdminToast`)で伝える。運営画面では、トーストが通知センター(右上のベル)に控えられる。
- 画面の中に出し続けるのは、「状態」(全問確定済み、答案が0件、読み込み中など)だけ。操作の結果を、画面の中の別の表示(`setPageMessage`)で出さない。
- 通知の文には、氏名・メールアドレスなどの個人情報を入れない(通知センターは、そのタブの `sessionStorage` に控える)。

## Wording

画面・メール・ヘルプの文言は、次のルールでそろえる(2026-10-10 に決めた)。

- 文体は「です・ます」。短く書く。結果を先に、理由はあとに。
- 結果は文で言い切り、「。」で閉じる。 例: 「保存しました。」「保存できませんでした。」
- 失敗は「◯◯できませんでした。（詳細：理由）」の形。文を閉じてから、括弧で詳細を足す。詳細の中には「。」を入れない。
- 進行中は「◯◯しています…」(「…」で終え、「。」は付けない)。
- お願いは「◯◯してください。」。次にとる行動があるときは、添える。
- 英語を画面に出さない。サーバー(データベース・外部サービス)のエラーは、`describeError(error, 'この操作の失敗の文')` / `errorDetail(error)`(`js/ui.js`)を通して、日本語にする。新しいサーバーのエラーを足したときは、`ERROR_MESSAGES` に日本語を足す。
- 用語: 「エントリー」(登録の流れ)、「当日受付」、「受付番号」(参加者の番号だけ)、「成績照会」。「成績開示」と混ぜない。「参加者様」のような敬称の重ね方はしない(個人には、氏名に「様」)。
