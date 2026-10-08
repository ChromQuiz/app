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
 * 入力されたメールアドレスを整える。全角の「＋」「＠」「．」や全角の英数字、全角スペースを半角にし(NFKC)、前後の空白を除く。
 * 日本語キーボードでは全角の記号が入りやすく、そのままだとメール会社に拒否される。
 * ハッシュ(本人確認)にもこの値を使うので、メールアドレスを読む場所では必ずこれを通す。
 * すでに半角のアドレスは変わらないため、これまでに登録された人のハッシュには影響しない。
 */
function normalizeEmailInput(value) {
    return String(value ?? '').normalize('NFKC').trim();
}

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

/**
 * 日時を「2026年10月13日 0:08」の形（日本時間・秒なし）にする。
 * 参加者の画面では、端末の時間帯に関係なく、大会の運営と同じ日本時間で見せる。
 */
function formatDateTimeJa(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map(part => [part.type, part.value]),
    );
    return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

/**
 * カナの入力を整える: 半角カナは全角に、ひらがなはカタカナに、空白は取り除く。
 * 検証は全角カタカナだけを通すので、見た目が正しくても末尾の空白やひらがなで弾かれるのを防ぐ。
 */
function normalizeKanaInput(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
        .replace(/\s+/g, '');
}

// カナの欄（エントリー・マイエントリー・代理登録）は、入力を離れたときに整える。
document.addEventListener('change', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.getAttribute('pattern') === '^[ァ-ヴー]+$') {
        input.value = normalizeKanaInput(input.value);
    }
});
