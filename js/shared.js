/**
 * CIQ 共通ユーティリティ (shared.js)
 *
 * 読み込み順:
 *   config.js → crypto.js → db.js → ui.js → shared.js
 */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof ConnectionMonitor !== 'undefined') ConnectionMonitor.init();
    if (typeof KeyboardShortcuts !== 'undefined') KeyboardShortcuts.init();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
});

/**
 * メールアドレスの形式チェック。サーバー側(supabase/functions/_shared/email_address.ts)と同じ規則。
 * 全角文字・空白・連続したドット・末尾の句点などを弾く(送信先のメール会社に拒否される形)。
 */
function isValidEmailAddress(value) {
    if (typeof value !== 'string' || value.length > 254) return false;
    const local = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
    const domain = '(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}';
    const match = new RegExp(`^(${local})@(${domain})$`).exec(value);
    return Boolean(match) && match[1].length <= 64;
}
