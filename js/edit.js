// edit.js — エントリー編集（メールアドレス + パスワード認証 → 内容更新）

const params = new URLSearchParams(location.search);
    let projectId = params.get('pid');
    let targetKey = null;
    let targetData = null;
    let authEmail = '';

    if (!projectId) {
        document.getElementById('auth-card').innerHTML = '<p style="text-align:center;color:var(--danger);font-weight:600;">プロジェクトIDが不明です。正しいURLからアクセスしてください。</p>';
    }

    (async () => {
        if (!projectId) return;
        await waitForAuth();
        try {
            let pName = await dbGet(`projects/${projectId}/publicSettings/projectName`);
            document.getElementById('edit-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - エントリー編集';
        } catch(e) {
            document.getElementById('edit-title').textContent = projectId;
        }
    })();

    function showAuthMsg(msg, type) {
        const sm = document.getElementById('auth-msg');
        sm.innerHTML = msg;
        sm.className = `page-msg ${type}`;
        sm.style.display = 'block';
    }

    function showEditMsg(msg, type) {
        const sm = document.getElementById('edit-msg');
        sm.innerHTML = msg;
        sm.className = `page-msg ${type}`;
        sm.style.display = 'block';
    }

    async function authenticate() {
        const email = document.getElementById('f-email').value.trim();
        const pw = document.getElementById('f-password').value.trim();

        if (!email || !pw) {
            showAuthMsg('メールアドレスとパスワードを入力してください。', 'error');
            return;
        }

        const btn = document.getElementById('auth-btn');
        btn.disabled = true;
        btn.textContent = '認証中...';
        showAuthMsg('データを確認しています...', '');

        try {
            const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
            const entriesData = await dbQuery(`projects/${projectId}/entries`, 'emailHash', emailHash);

            if (!entriesData || Object.keys(entriesData).length === 0) {
                showAuthMsg('指定されたメールアドレスに一致するエントリーが見つかりません。', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 認証してエントリーを編集';
                return;
            }

            const pwHash = await AppCrypto.hashPassword(pw);
            let matched = false;

            for (const [key, data] of Object.entries(entriesData)) {
                if (data.disclosurePw === pwHash) {
                    targetKey = key;
                    targetData = data;
                    matched = true;
                }
            }

            if (!matched) {
                showAuthMsg('パスワードが正しくありません。', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 認証してエントリーを編集';
                return;
            }

            if (targetData.status === 'canceled') {
                showAuthMsg('このエントリーはキャンセルされています。', 'error');
                btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 認証してエントリーを編集';
                return;
            }

            authEmail = email;

            // 公開フィールドをフォームにプリフィル
            document.getElementById('edit-entry-number').textContent = String(targetData.entryNumber).padStart(3, '0');
            document.getElementById('e-affiliation').value = targetData.affiliation || '';
            document.getElementById('e-grade').value = targetData.grade || '';
            document.getElementById('e-chubu').checked = targetData.isChubu === true;
            document.getElementById('e-entry-name').value = targetData.entryName || '';
            document.getElementById('e-message').value = targetData.message || '';

            // 認証フォームを隠して編集フォームを表示
            document.getElementById('auth-card').style.display = 'none';
            document.getElementById('edit-card').style.display = 'block';

        } catch (err) {
            showAuthMsg('システムエラーが発生しました。', 'error');
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 認証してエントリーを編集';
        }
    }

    async function saveEdit() {
        const familyName = document.getElementById('e-family-name').value.trim();
        const firstName = document.getElementById('e-first-name').value.trim();
        const familyNameKana = document.getElementById('e-family-kana').value.trim();
        const firstNameKana = document.getElementById('e-first-kana').value.trim();
        const affiliation = document.getElementById('e-affiliation').value.trim();
        const grade = document.getElementById('e-grade').value;
        const isChubu = document.getElementById('e-chubu').checked;
        const entryName = document.getElementById('e-entry-name').value.trim();
        const message = document.getElementById('e-message').value.trim();
        const inquiry = document.getElementById('e-inquiry').value.trim();

        if (!familyName || !firstName) {
            showEditMsg('姓名は必須項目です。', 'error');
            return;
        }

        const btn = document.getElementById('save-btn');
        btn.disabled = true;
        btn.textContent = '保存中...';
        showEditMsg('更新しています...', '');

        try {
            // PII再暗号化
            const publicKeyJwk = await dbGet(`projects/${projectId}/publicSettings/publicKey`);
            if (!publicKeyJwk) throw new Error('セキュリティキーが取得できません');

            const useEntryName = false;
            const piiData = {
                email: authEmail,
                familyName, firstName, familyNameKana, firstNameKana,
                affiliation, grade, entryName, useEntryName, isChubu,
                message, inquiry
            };
            const encryptedPII = await AppCrypto.encryptRSA(JSON.stringify(piiData), publicKeyJwk);

            // 更新データ（受付番号・タイムスタンプ・ステータスは変更しない）
            const updates = {
                encryptedPII,
                entryName,
                affiliation,
                grade,
                message,
                isChubu
            };

            await dbUpdate(`projects/${projectId}/entries/${targetKey}`, updates);

            document.getElementById('edit-card').style.display = 'none';
            document.getElementById('done-card').style.display = 'block';

        } catch (err) {
            showEditMsg('保存に失敗しました: ' + err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 変更を保存する';
        }
    }

    // Enterキーで認証
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            if (document.getElementById('auth-card').style.display !== 'none') {
                authenticate();
            }
        }
    });
