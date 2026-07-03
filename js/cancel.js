// cancel.js - Supabase public cancellation

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');
let projectName = '';
let notifyEntryCancel = true;

function cancelIcon(className) {
    const icon = document.createElement('i');
    icon.className = className;
    return icon;
}

function setCancelButton(button, text, iconClass = '') {
    if (!button) return;
    button.textContent = '';
    if (iconClass) button.append(cancelIcon(iconClass), ' ');
    button.appendChild(document.createTextNode(text));
}

function showCancelCardMessage(message) {
    const card = document.getElementById('form-card');
    card.textContent = '';
    const p = document.createElement('p');
    p.className = 'inline-danger-message';
    p.textContent = message;
    card.appendChild(p);
}

if (!projectId) {
    showCancelCardMessage('プロジェクトIDが不明です。正しいURLからアクセスしてください。');
    throw new Error('No Project ID');
}

function requireSupabasePublicApi() {
    if (!window.CIQSupabaseAPI?.isEnabled?.()) {
        throw new Error('Supabase設定が見つかりません。');
    }
}

function showStatus(msg, type) {
    const sm = document.getElementById('status-msg');
    sm.textContent = msg;
    sm.className = `page-msg ${type}`;
    sm.classList.add('is-visible');
}

async function init() {
    try {
        requireSupabasePublicApi();
        const settings = await CIQSupabaseAPI.getPublicSettings(projectId);
        projectName = settings?.projectName || projectId;
        notifyEntryCancel = settings?.notifyEntryCancel !== false;
        document.getElementById('cancel-title').textContent = projectName;
        document.title = projectName + ' - キャンセルフォーム';
    } catch (e) {
        projectName = projectId;
        document.getElementById('cancel-title').textContent = projectId;
        showStatus(e.message || 'プロジェクト情報を読み込めませんでした。', 'error');
    }
}

async function processCancel(event) {
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
        requireSupabasePublicApi();
        const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
        const pwHash = await AppCrypto.hashPassword(pw);
        const result = await CIQSupabaseAPI.cancelEntry({
            projectId,
            emailHash,
            disclosurePasswordHash: pwHash,
        });

        const entryNum = result.canceledEntry?.entryNumber;
        if (notifyEntryCancel) CIQEmail.sendCancellation(email, {
            projectName: projectName || projectId,
            entryNumber: String(entryNum).padStart(3, '0'),
            entryId: result.canceledEntry?.id,
            emailHash,
            familyName: '',
            firstName: '',
            senderName: (projectName || projectId) + ' 実行委員会'
        }).catch(e => console.warn('キャンセルメール送信スキップ:', e));

        showCancelComplete(entryNum, result.promotedEntry?.entryNumber, notifyEntryCancel);
    } catch (err) {
        showStatus(err?.message || 'システムエラーが発生しました。', 'error');
        btn.disabled = false;
        setCancelButton(btn, 'キャンセルを確定する', 'fa-solid fa-trash');
    }
}

function showCancelComplete(entryNum, promotedEntryNumber, notificationSent) {
    const card = document.getElementById('form-card');
    card.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'cancel-complete';
    const title = document.createElement('h2');
    title.textContent = 'キャンセル完了';
    const detail = document.createElement('p');
    detail.append(
        `受付番号 ${entryNum} のエントリーキャンセルを受け付けました。`,
    );
    if (notificationSent) detail.append(document.createElement('br'), '確認メールを送信しました。');
    if (promotedEntryNumber) {
        detail.append(
            document.createElement('br'),
            `キャンセル待ちの受付番号 ${String(promotedEntryNumber).padStart(3, '0')} を繰り上げました。`
        );
    }
    detail.append(document.createElement('br'), 'ご利用ありがとうございました。');
    wrap.append(title, detail);
    card.appendChild(wrap);
}

document.getElementById('form-card')?.addEventListener('submit', processCancel);

init();
