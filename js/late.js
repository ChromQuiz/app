// late.js — 遅刻フォーム処理（メールアドレス + パスワード認証）

const params = new URLSearchParams(location.search);
    let projectId = params.get('pid');

    if (!projectId) {
        document.getElementById('form-card').innerHTML = '<p style="text-align:center;color:var(--danger);font-weight:600;">プロジェクトIDが不明です。正しいURLからアクセスしてください。</p>';
        throw new Error('No Project ID');
    }

    (async () => {
        if (!projectId) return;
        await waitForAuth();
        try {
            let pName = await dbGet(`projects/${projectId}/publicSettings/projectName`);
            document.getElementById('late-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - 遅刻フォーム';
        } catch(e) {
            document.getElementById('late-title').textContent = projectId;
        }
    })();

    function showStatus(msg, type) {
        const sm = document.getElementById('status-msg');
        sm.innerHTML = msg;
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
            const entriesData = await dbQuery(`projects/${projectId}/entries`, 'emailHash', emailHash);

            if (!entriesData || Object.keys(entriesData).length === 0) {
                showStatus('指定されたメールアドレスに一致するエントリーが見つかりません。', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 遅刻を届け出る';
                return;
            }

            let targetKey = null;
            let targetData = null;
            let matched = false;
            const pwHash = await AppCrypto.hashPassword(pw);

            for (const [key, data] of Object.entries(entriesData)) {
                if (data.disclosurePw === pwHash) {
                    targetKey = key;
                    targetData = data;
                    matched = true;
                }
            }

            if (!matched) {
                showStatus('パスワードが正しくありません。', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 遅刻を届け出る';
                return;
            }

            if (targetData.status === 'late') {
                showStatus('既に遅刻が届け出済みです。', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 遅刻を届け出る';
                return;
            }

            // ステータスを「遅刻」に変更
            await dbSet(`projects/${projectId}/entries/${targetKey}/status`, 'late');

            document.getElementById('form-card').style.display = 'none';
            document.getElementById('done-card').style.display = 'block';

        } catch (err) {
            showStatus('システムエラーが発生しました。', 'error');
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 遅刻を届け出る';
        }
    }

    // Enterキーで送信
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && document.getElementById('form-card').style.display !== 'none') {
            processLate();
        }
    });
