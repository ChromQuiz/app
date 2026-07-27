// join.js — 採点者招待リンクの引き換え画面（AB-1）。
//
// 流れ: 招待URL(join.html?t=TOKEN) を開く → 未ログインなら Google ログイン → 参加 → 採点画面へ。
// トークンの正当性・有効期限・使用上限はすべてサーバ(redeem-scorer-invite)で判定する。
// クライアントは結果を表示するだけで、判定に関与しない。

(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('t') || '';
    // ログイン往復でトークンを失わないよう保持する（タブを閉じれば消える）。
    const TOKEN_KEY = 'ciqJoinToken';
    if (token) {
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage 不可でも続行 */ }
    }

    function el(id) { return document.getElementById(id); }

    function setStatus(message, type = 'info') {
        const box = el('join-status');
        if (!box) return;
        box.textContent = message;
        box.className = `page-msg ${type} is-visible`;
    }

    function show(id) { el(id)?.classList.remove('u-hidden'); }
    function hide(id) { el(id)?.classList.add('u-hidden'); }

    function storedToken() {
        if (token) return token;
        try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    }

    async function redeem() {
        const t = storedToken();
        if (!t) {
            setStatus('招待リンクが正しくありません。管理者から共有されたリンクを開いてください。', 'error');
            return;
        }
        setStatus('参加処理を行っています...');
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
                    ? 'すでにこのプロジェクトに参加しています。'
                    : `${project?.name || result.projectId} に採点者として参加しました。`,
                'success',
            );
            hide('join-signin-btn');
            show('join-continue-btn');
        } catch (e) {
            setStatus(e.message || '参加できませんでした。', 'error');
            hide('join-signin-btn');
            hide('join-continue-btn');
        }
    }

    async function init() {
        el('join-continue-btn')?.addEventListener('click', () => { location.href = 'judge.html'; });
        el('join-signin-btn')?.addEventListener('click', async () => {
            try {
                await CIQSupabaseAPI.signInWithGoogle();
            } catch (e) {
                setStatus('Googleサインインを開始できませんでした: ' + (e.message || ''), 'error');
            }
        });

        if (!storedToken()) {
            setStatus('招待リンクが正しくありません。管理者から共有されたリンクを開いてください。', 'error');
            return;
        }
        if (!window.CIQSupabaseAPI?.isEnabled?.()) {
            setStatus('設定が見つかりません。しばらくしてから再度お試しください。', 'error');
            return;
        }

        const sessionData = await CIQSupabaseAPI.getSession().catch(() => null);
        if (!sessionData?.user) {
            setStatus('参加するには Google アカウントでのログインが必要です。');
            show('join-signin-btn');
            return;
        }
        await redeem();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
