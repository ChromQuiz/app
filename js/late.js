// late.js — 遅刻フォーム処理（メールアドレス + パスワード認証）

const params = new URLSearchParams(location.search);
let projectId = params.get('pid');

if (!projectId) {
    document.getElementById('form-card').innerHTML = '<p style="text-align:center;color:var(--danger);font-weight:600;">プロジェクトIDが不明です。正しいURLからアクセスしてください。</p>';
    throw new Error('No Project ID');
}

    (async () => {
        if (!projectId) return;
        try {
            if (!window.CIQSupabaseAPI?.isEnabled?.()) {
                throw new Error('Supabase設定が見つかりません。');
            }
            const settings = await CIQSupabaseAPI.getPublicSettings(projectId);
            let pName = settings?.projectName || projectId;
            document.getElementById('late-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - 遅刻フォーム';
        } catch(e) {
            document.getElementById('late-title').textContent = projectId;
        }
    })();

    function showStatus(msg, type) {
        const sm = document.getElementById('status-msg');
        sm.textContent = msg;
        sm.className = `page-msg ${type}`;
        sm.style.display = 'block';
    }

    async function processLate() {
        const email = document.getElementById('f-email').value.trim();
        const pw = document.getElementById('f-password').value.trim();

        if (!email || !pw) {
            showStatus('メールアドレスとパスワードを入力してください。', 'error');
            return;
        }

        const btn = document.getElementById('submit-btn');
        btn.disabled = true;
        btn.textContent = '認証中...';
        showStatus('データを確認しています...', '');

        try {
            const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
            const pwHash = await AppCrypto.hashPassword(pw);
            await CIQSupabaseAPI.markLate({
                projectId,
                emailHash,
                disclosurePasswordHash: pwHash,
            });

            document.getElementById('form-card').style.display = 'none';
            document.getElementById('done-card').style.display = 'block';

        } catch (err) {
            showStatus(err.message || 'システムエラーが発生しました。', 'error');
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 遅刻を届け出る';
        }
    }

    // Enterキーで送信
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && document.getElementById('form-card').style.display !== 'none') {
            processLate();
        }
    });
