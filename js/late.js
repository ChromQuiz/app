// late.js — 遅刻フォーム処理（メールアドレス + パスワード認証）

const params = new URLSearchParams(location.search);
let projectId = params.get('pid');
let projectName = '';
let notifyLateNotice = true;

function showEl(el) {
    el?.classList.remove('u-hidden');
}

function hideEl(el) {
    el?.classList.add('u-hidden');
}

function lateIcon(className) {
    const icon = createIcon(className);
    return icon;
}

function setLateButton(button, text, iconClass = '') {
    if (!button) return;
    button.textContent = '';
    if (iconClass) button.append(lateIcon(iconClass), ' ');
    button.appendChild(document.createTextNode(text));
}

function showLateCardMessage(message) {
    const card = document.getElementById('form-card');
    card.textContent = '';
    const p = document.createElement('p');
    p.className = 'inline-danger-message';
    p.textContent = message;
    card.appendChild(p);
}

if (!projectId) {
    showLateCardMessage('プロジェクトIDが不明です。正しいURLからアクセスしてください。');
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
            projectName = pName;
            notifyLateNotice = settings?.notifyLateNotice !== false;
            document.getElementById('late-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - 遅刻フォーム';
        } catch(e) {
            projectName = projectId;
            document.getElementById('late-title').textContent = projectId;
        }
    })();

    function showStatus(msg, type) {
        const sm = document.getElementById('status-msg');
        sm.textContent = msg;
        sm.className = `page-msg ${type}`;
        sm.classList.add('is-visible');
    }

    async function processLate(event) {
        event?.preventDefault();
        const form = document.getElementById('form-card');
        if (!form.reportValidity()) {
            showStatus('メールアドレスとパスワードを入力してください。', 'error');
            return;
        }

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
            const result = await CIQSupabaseAPI.markLate({
                projectId,
                emailHash,
                disclosurePasswordHash: pwHash,
            });

            if (notifyLateNotice && window.CIQEmail?.sendLateNotice) {
                CIQEmail.sendLateNotice(email, {
                    projectName: projectName || projectId,
                    entryNumber: String(result.entry?.entryNumber || '').padStart(3, '0'),
                    entryId: result.entry?.id,
                    emailHash,
                    familyName: '',
                    firstName: '',
                    senderName: (projectName || projectId) + ' 実行委員会',
                }).catch(e => console.warn('遅刻連絡メール送信スキップ:', e));
            }

            hideEl(document.getElementById('form-card'));
            showEl(document.getElementById('done-card'));

        } catch (err) {
            showStatus(err.message || 'システムエラーが発生しました。', 'error');
            btn.disabled = false;
            setLateButton(btn, '遅刻を届け出る', 'fa-solid fa-clock-rotate-left');
        }
    }

    document.getElementById('form-card')?.addEventListener('submit', processLate);
