/**
 * CIQ 共通ユーティリティ (shared.js)
 *
 * 読み込み順:
 *   config.js → crypto.js → db.js → ui.js → custom-select.js → shared.js
 */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof ConnectionMonitor !== 'undefined') ConnectionMonitor.init();
    if (typeof KeyboardShortcuts !== 'undefined') KeyboardShortcuts.init();
    if (typeof CustomSelect !== 'undefined') CustomSelect.initAll();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
});
