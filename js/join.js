// join.js — 採点者招待リンクの引き換え画面（AB-1）。
//
// 流れ: 招待URL(join.html?t=TOKEN) を開く → 未ログインなら Google ログイン → 参加 → 採点画面へ。
// トークンの正当性・有効期限・使用上限はすべてサーバ(redeem-scorer-invite)で判定する。
// クライアントは結果を表示するだけで、判定に関与しない。
//
// UI 契約: ログイン画面(index.html)と同一の認証シェル・同一の .btn-google を使う。
// 状態表示は共有の setPageMessage() に委ね、この画面専用の通知枠は作らない。

(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('t') || '';
    // ログイン往復でトークンを失わないよう保持する（タブを閉じれば消える）。
    const TOKEN_KEY = 'ciqJoinToken';
    if (token) {
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage 不可でも続行 */ }
    }

    const INVALID_LINK_MESSAGE = '招待リンクが正しくありません。管理者から共有された最新のリンクを開いてください。';

    function el(id) { return document.getElementById(id); }

    function setStatus(message, type = 'info') {
        setPageMessage(el('join-status'), message, type);
    }

    function show(id) { el(id)?.classList.remove('u-hidden'); }
    function hide(id) { el(id)?.classList.add('u-hidden'); }

    // 読み込み中は Google ボタンを操作不能にし、二重送信を防ぐ。
    function setSigninBusy(busy) {
        const button = el('join-signin-btn');
        if (!button) return;
        button.disabled = busy;
        if (busy) button.setAttribute('aria-busy', 'true');
        else button.removeAttribute('aria-busy');
    }

    function storedToken() {
        if (token) return token;
        try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    }

    async function redeem() {
        const t = storedToken();
        if (!t) {
            setStatus(INVALID_LINK_MESSAGE, 'error');
            return;
        }
        setStatus('参加処理を行っています。');
        try {
            const result = await CIQSupabaseAPI.redeemScorerInvite(t);
            try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }

            const projects = await CIQSupabaseAPI.listMyProjects().catch(() => []);
            const project = projects.find(p => p.id === result.projectId);
            session.set('projectId', result.projectId);
            session.set('projectName', project?.name || result.projectId);
            session.set('scorer_name', result.displayName || '');
            session.set('scorer_role', result.role === 'scorer' ? 'scorer' : 'admin');
            session.set('supabaseMode', 'true');

            setStatus(
                result.alreadyMember
                    ? `${project?.name || result.projectId} にはすでに参加しています。`
                    : `${project?.name || result.projectId} に採点者として参加しました。`,
                'success',
            );
            hide('join-signin-btn');
            show('join-continue-btn');
        } catch (e) {
            // 期限切れ・使用上限・失効はサーバの判定文をそのまま伝える(握りつぶさない)。
            setStatus(e.message || '参加できませんでした。管理者に新しい招待リンクを依頼してください。', 'error');
            hide('join-signin-btn');
            hide('join-continue-btn');
        }
    }

    async function init() {
        el('join-continue-btn')?.addEventListener('click', () => { location.href = 'judge.html'; });
        el('join-signin-btn')?.addEventListener('click', async () => {
            setSigninBusy(true);
            try {
                await CIQSupabaseAPI.signInWithGoogle();
            } catch (e) {
                setSigninBusy(false);
                setStatus('Googleサインインを開始できませんでした。時間をおいて再度お試しください。' + (e.message ? `(${e.message})` : ''), 'error');
            }
        });

        if (!storedToken()) {
            setStatus(INVALID_LINK_MESSAGE, 'error');
            return;
        }
        if (!window.CIQSupabaseAPI?.isEnabled?.()) {
            setStatus('サーバーに接続できません。時間をおいて再度お試しください。', 'error');
            return;
        }

        const sessionData = await CIQSupabaseAPI.getSession().catch(() => null);
        if (!sessionData?.user) {
            // 未ログインは「異常」ではなく既定の入口。ボタン自体が案内なので、
            // 状態メッセージを重ねて置かない。
            clearPageMessage(el('join-status'));
            show('join-signin-btn');
            return;
        }
        await redeem();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
