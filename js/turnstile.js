// turnstile.js — Cloudflare Turnstile のクライアント補助(V2)。
//
// 役割は「widget を描画してトークンを取り出す」だけ。検証は必ずサーバ(Edge Function)で行う。
// クライアントの成功状態は認可判断に使わない(UX 用のみ)。
//
// site key は公開値(window.CIQ_TURNSTILE_SITE_KEY)。secret key はクライアントに存在しない。
// site key 未設定・API 読込失敗時は widget を描画せず、トークン無しで送信する
// (サーバが fail-closed で拒否するため、クライアント側で握り潰さない)。

const CIQTurnstile = (() => {
    const widgets = new Map(); // containerId -> widgetId

    // Cloudflare 公式のテスト用 sitekey(always passes)。ローカル開発専用。
    // 本番 sitekey は本番ホスト以外では使わない(本番 widget の許可 hostname は本番ドメインのみ)。
    const TEST_SITE_KEY = '1x00000000000000000000AA';
    const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', ''];

    function isLocalHost() {
        return LOCAL_HOSTS.includes(location.hostname) || location.protocol === 'file:';
    }

    function siteKey() {
        // ローカルでは公式テストキーに切り替える。本番 sitekey/secret をローカルで使用しない。
        // (テストキー由来の token は本番 secret では検証できないため、ローカルからの本番送信は成立しない=意図どおり)
        if (isLocalHost()) return TEST_SITE_KEY;
        return String(window.CIQ_TURNSTILE_SITE_KEY || '').trim();
    }

    function available() {
        return Boolean(siteKey() && window.turnstile);
    }

    // Turnstile の枠は、幅が約300px未満にならない。細い画面（カードの内側が300px未満）では、はみ出して
    // 横スクロールになるので、収まる大きさに縮める（拡大率は CSS 変数で渡す。インライン style 属性は使わない）。
    const WIDGET_MIN_WIDTH = 300;
    const WIDGET_HEIGHT = 65;
    const fitObservers = new WeakMap();

    function fitToWidth(el) {
        const apply = () => {
            const available = el.clientWidth;
            const scale = available > 0 ? Math.min(1, available / WIDGET_MIN_WIDTH) : 1;
            el.classList.toggle('is-scaled', scale < 1);
            el.style.setProperty('--ts-scale', String(scale));
            el.style.setProperty('--ts-h', `${Math.ceil(WIDGET_HEIGHT * scale)}px`);
        };
        apply();
        if (typeof ResizeObserver === 'function' && !fitObservers.has(el)) {
            const observer = new ResizeObserver(apply);
            observer.observe(el);
            fitObservers.set(el, observer);
        }
    }

    /**
     * 指定コンテナに widget を描画する(冪等)。action は Edge 側の検証値と一致させること。
     * options.appearance: 'interaction-only' なら、自動で通るときは表示しない(既定は常に表示)。
     * 描画できない場合(site key 未設定 / API 未読込)は false を返す。
     */
    function render(containerId, action, options = {}) {
        const el = document.getElementById(containerId);
        if (!el) return false;
        if (!available()) return false;
        if (widgets.has(containerId)) return true;
        try {
            const id = window.turnstile.render(el, {
                sitekey: siteKey(),
                action,
                theme: 'auto',
                size: 'flexible',   // 狭いスマートフォン幅でも収まる
                // 'interaction-only': 自動で通ったときは何も表示せず、人の操作が必要なときだけ出す
                appearance: options.appearance === 'interaction-only' ? 'interaction-only' : 'always',
            });
            widgets.set(containerId, id);
            el.classList.remove('u-hidden');
            fitToWidth(el);
            return true;
        } catch (e) {
            console.warn('[turnstile] render failed:', e);
            return false;
        }
    }

    /** 現在のトークンを返す(未取得・未描画なら '')。 */
    function token(containerId) {
        const id = widgets.get(containerId);
        if (id === undefined || !window.turnstile) return '';
        try {
            return String(window.turnstile.getResponse(id) || '');
        } catch {
            return '';
        }
    }

    /**
     * トークンを使い切った/失敗した後は必ずリセットする。
     * Turnstile のトークンはワンタイム(再利用はサーバ側で timeout-or-duplicate として拒否される)。
     */
    function reset(containerId) {
        const id = widgets.get(containerId);
        if (id === undefined || !window.turnstile) return;
        try {
            window.turnstile.reset(id);
        } catch (e) {
            console.warn('[turnstile] reset failed:', e);
        }
    }

    return { available, render, token, reset };
})();
