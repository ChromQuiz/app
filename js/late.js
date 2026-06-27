// late.js — 遅刻フォーム処理（メールアドレス + パスワード認証）

const params = new URLSearchParams(location.search);
let projectId = params.get('pid');

function lateIcon(className) {
    const icon = document.createElement('i');
    icon.className = className;
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
    p.style.textAlign = 'center';
    p.style.color = 'var(--danger)';
    p.style.fontWeight = '600';
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
            btn.disabled = false;
            setLateButton(btn, '遅刻を届け出る', 'fa-solid fa-clock-rotate-left');
        }
    }

    // Enterキーで送信
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && document.getElementById('form-card').style.display !== 'none') {
            processLate();
        }
    });

    document.getElementById('submit-btn')?.addEventListener('click', processLate);
