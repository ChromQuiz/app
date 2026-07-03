// edit.js — エントリー編集（メールアドレス + パスワード認証 → 内容更新）

const params = new URLSearchParams(location.search);
let projectId = params.get('pid');
let targetData = null;
let authEmail = '';
let authEmailHash = '';
let authPasswordHash = '';
let publicKeyJwk = null;
let projectName = '';
let notifyEntryEdit = true;

function showEl(el) {
    el?.classList.remove('u-hidden');
}

function hideEl(el) {
    el?.classList.add('u-hidden');
}

function editIcon(className) {
    const icon = createIcon(className);
    return icon;
}

function setEditButton(button, text, iconClass = '') {
    if (!button) return;
    button.textContent = '';
    if (iconClass) button.append(editIcon(iconClass), ' ');
    button.appendChild(document.createTextNode(text));
}

function showEditCardMessage(message) {
    const card = document.getElementById('auth-card');
    card.textContent = '';
    const p = document.createElement('p');
    p.className = 'inline-danger-message';
    p.textContent = message;
    card.appendChild(p);
}

if (!projectId) {
    showEditCardMessage('プロジェクトIDが不明です。正しいURLからアクセスしてください。');
}

    function getEditClosedReason(settings) {
        if (settings.entryOpen !== true) return '現在エントリー内容の編集はできません。';
        const now = new Date();
        const start = settings.periodStart ? new Date(settings.periodStart) : null;
        const end = settings.periodEnd ? new Date(settings.periodEnd) : null;
        if (start && start > now) return 'エントリー受付開始前のため、編集できません。';
        if (end && end < now) return 'エントリー受付終了後のため、編集できません。';
        return '';
    }

    (async () => {
        if (!projectId) return;
        try {
            if (!window.CIQSupabaseAPI?.isEnabled?.()) {
                throw new Error('Supabase設定が見つかりません。');
            }
            const settings = await CIQSupabaseAPI.getPublicSettings(projectId);
            let pName = settings?.projectName || projectId;
            projectName = pName;
            notifyEntryEdit = settings?.notifyEntryEdit !== false;
            publicKeyJwk = settings?.publicKey || null;
            document.getElementById('edit-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - エントリー編集';
            const closedReason = getEditClosedReason(settings || {});
            if (closedReason) showEditCardMessage(closedReason);
        } catch(e) {
            projectName = projectId;
            document.getElementById('edit-title').textContent = projectId;
        }
    })();

    function showAuthMsg(msg, type) {
        const sm = document.getElementById('auth-msg');
        sm.textContent = msg;
        sm.className = `page-msg ${type}`;
        sm.classList.add('is-visible');
    }

    function showEditMsg(msg, type) {
        const sm = document.getElementById('edit-msg');
        sm.textContent = msg;
        sm.className = `page-msg ${type}`;
        sm.classList.add('is-visible');
    }

    async function authenticate(event) {
        event?.preventDefault();
        const form = document.getElementById('auth-card');
        if (!form.reportValidity()) {
            showAuthMsg('メールアドレスとパスワードを入力してください。', 'error');
            return;
        }

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
            const pwHash = await AppCrypto.hashPassword(pw);
            const result = await CIQSupabaseAPI.editEntry({
                projectId,
                emailHash,
                disclosurePasswordHash: pwHash,
            });

            authEmail = email;
            authEmailHash = emailHash;
            authPasswordHash = pwHash;
            targetData = result.entry;

            // 公開フィールドをフォームにプリフィル
            document.getElementById('edit-entry-number').textContent = String(targetData.entryNumber).padStart(3, '0');
            document.getElementById('e-affiliation').value = targetData.affiliation || '';
            document.getElementById('e-grade').value = targetData.grade || '';
            document.getElementById('e-chubu').checked = targetData.isChubu === true;
            document.getElementById('e-entry-name').value = targetData.entryName || '';
            if (targetData.allowRealNameInRecord === true || targetData.allowRealNameInRecord === false) {
                const permissionValue = targetData.allowRealNameInRecord ? 'allow' : 'deny';
                const permissionInput = document.querySelector(`input[name="e-record-name-permission"][value="${permissionValue}"]`);
                if (permissionInput) permissionInput.checked = true;
            }
            document.getElementById('e-message').value = targetData.message || '';
            document.getElementById('e-inquiry').value = targetData.inquiry || '';

            // 認証フォームを隠して編集フォームを表示
            hideEl(document.getElementById('auth-card'));
            showEl(document.getElementById('edit-card'));

        } catch (err) {
            showAuthMsg(err.message || 'システムエラーが発生しました。', 'error');
            btn.disabled = false;
            setEditButton(btn, '認証してエントリーを編集', 'fa-solid fa-right-to-bracket');
        }
    }

    async function saveEdit(event) {
        event?.preventDefault();
        const form = document.getElementById('edit-card');
        if (!form.reportValidity()) {
            showEditMsg('必須項目を入力してください。', 'error');
            return;
        }

        const familyName = document.getElementById('e-family-name').value.trim();
        const firstName = document.getElementById('e-first-name').value.trim();
        const familyNameKana = document.getElementById('e-family-kana').value.trim();
        const firstNameKana = document.getElementById('e-first-kana').value.trim();
        const affiliation = document.getElementById('e-affiliation').value.trim();
        const grade = document.getElementById('e-grade').value;
        const isChubu = document.getElementById('e-chubu').checked;
        const entryName = document.getElementById('e-entry-name').value.trim();
        const recordNamePermission = document.querySelector('input[name="e-record-name-permission"]:checked')?.value || '';
        const message = document.getElementById('e-message').value.trim();
        const inquiry = document.getElementById('e-inquiry').value.trim();

        if (!familyName || !firstName || !familyNameKana || !firstNameKana || !affiliation || !grade || !entryName || !recordNamePermission) {
            showEditMsg('必須項目を入力してください。', 'error');
            return;
        }
        if (!/^[ァ-ヴー]+$/.test(familyNameKana) || !/^[ァ-ヴー]+$/.test(firstNameKana)) {
            showEditMsg('カナは全角カタカナで入力してください。', 'error');
            return;
        }

        const btn = document.getElementById('save-btn');
        btn.disabled = true;
        btn.textContent = '保存中...';
        showEditMsg('更新しています...', '');

        try {
            // PII再暗号化
            if (!publicKeyJwk) throw new Error('セキュリティキーが取得できません');

            const useEntryName = false;
            const allowRealNameInRecord = recordNamePermission === 'allow';
            const piiData = {
                email: authEmail,
                familyName, firstName, familyNameKana, firstNameKana,
                affiliation, grade, entryName, useEntryName, allowRealNameInRecord, isChubu,
                message, inquiry
            };
            const encryptedPII = await AppCrypto.encryptRSA(JSON.stringify(piiData), publicKeyJwk);

            const result = await CIQSupabaseAPI.editEntry({
                projectId,
                emailHash: authEmailHash,
                disclosurePasswordHash: authPasswordHash,
                encryptedPii: encryptedPII,
                publicProfile: {
                    entryName,
                    affiliation,
                    grade,
                    message,
                    inquiry,
                    isChubu,
                    allowRealNameInRecord,
                },
            });

            if (notifyEntryEdit && window.CIQEmail?.sendEntryEdited) {
                CIQEmail.sendEntryEdited(authEmail, {
                    projectName: projectName || projectId,
                    entryNumber: String(result.entry?.entryNumber || targetData?.entryNumber || '').padStart(3, '0'),
                    entryId: result.entry?.id || targetData?.id,
                    emailHash: authEmailHash,
                    familyName,
                    firstName,
                    senderName: (projectName || projectId) + ' 実行委員会',
                }).catch(e => console.warn('編集完了メール送信スキップ:', e));
            }

            hideEl(document.getElementById('edit-card'));
            showEl(document.getElementById('done-card'));

        } catch (err) {
            showEditMsg('保存に失敗しました: ' + err.message, 'error');
            btn.disabled = false;
            setEditButton(btn, '変更を保存する', 'fa-solid fa-floppy-disk');
        }
    }

    document.getElementById('auth-card')?.addEventListener('submit', authenticate);
    document.getElementById('edit-card')?.addEventListener('submit', saveEdit);
