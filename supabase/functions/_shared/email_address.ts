// email_address.ts — メールアドレスの形式チェック(サーバー側)。
//
// 画面側(js/shared.js の isValidEmailAddress)と同じ規則。変えるときは両方と tests/email_address.test.mjs を揃える。
//
// 「@ と . があるか」だけの緩いチェックだと、全角文字・末尾の句点・連続したドットなどが通り抜け、
// 送信先のメール会社(Brevo)に拒否されて原因の分からない失敗になる。ここで先に弾く。
// 国際化ドメイン(日本語ドメイン)は ASCII(punycode)で入力してもらう。

const LOCAL = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const DOMAIN = '(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}';
const EMAIL_RE = new RegExp(`^(${LOCAL})@(${DOMAIN})$`);

export function isValidEmailAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length > 254) return false;
  const match = EMAIL_RE.exec(value);
  return Boolean(match) && match![1].length <= 64;
}
