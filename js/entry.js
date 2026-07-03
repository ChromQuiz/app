// entry.js - Supabase public entry form

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');
let supabasePublicSettingsCache = null;

let emailVerified = false;
let verifiedEmail = '';
let verifySignature = '';
let verifyExpiresAt = 0;
let resendCooldown = null;
let sessionTimer = null;
const SESSION_TIMEOUT = 10 * 60 * 1000;

function showEl(el) {
    el?.classList.remove('u-hidden');
}

function hideEl(el) {
    el?.classList.add('u-hidden');
}

function entryIcon(className) {
    const icon = document.createElement('i');
    icon.className = className;
    return icon;
}

function setEntryButton(button, text, iconClass = '') {
    if (!button) return;
    button.textContent = '';
    if (iconClass) button.append(entryIcon(iconClass), ' ');
    button.appendChild(document.createTextNode(text));
}

function requireSupabasePublicApi() {
    if (!window.CIQSupabaseAPI?.isEnabled?.()) {
        throw new Error('Supabase設定が見つかりません。');
    }
}

async function loadPublicSettings() {
    requireSupabasePublicApi();
    supabasePublicSettingsCache = await CIQSupabaseAPI.getPublicSettings(projectId);
    return supabasePublicSettingsCache;
}

function showDisabled(title, detail) {
    hideEl(document.getElementById('form-card'));
    document.getElementById('disabled-title').textContent = title;
    document.getElementById('disabled-detail').textContent = detail;
    showEl(document.getElementById('disabled-card'));
}

function showVerifyMsg(msg, type) {
    const el = document.getElementById('verify-msg');
    el.textContent = msg;
    el.className = `page-msg ${type}`;
    el.classList.add('is-visible');
}

function clearVerifyMsg() {
    const el = document.getElementById('verify-msg');
    el.textContent = '';
    el.className = 'page-msg';
    el.classList.remove('is-visible');
}

function showVerifyHelp(msg) {
    const el = document.getElementById('verify-help-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('u-hidden');
}

function clearVerifyHelp() {
    const el = document.getElementById('verify-help-msg');
    if (!el) return;
    el.textContent = '';
    el.classList.add('u-hidden');
}

function showVerificationMailboxHelp() {
    showVerifyHelp('届かない場合は迷惑メールフォルダも確認してください。');
}

function showStatus(msg, type) {
    const sm = document.getElementById('status-msg');
    sm.textContent = msg;
    sm.className = `page-msg ${type}`;
    sm.classList.add('is-visible');
}

function clearStatus() {
    const sm = document.getElementById('status-msg');
    sm.textContent = '';
    sm.className = 'page-msg';
    sm.classList.remove('is-visible');
}

function getPreVerificationSubmitMessage() {
    const email = document.getElementById('f-email').value.trim();
    const codeAreaVisible = !document.getElementById('code-input-area').classList.contains('u-hidden');
    const code = document.getElementById('f-verify-code').value.trim();
    if (!email) return 'メールアドレスを入力してください。';
    if (codeAreaVisible && !code) return '認証コードを入力してください。';
    if (codeAreaVisible) return '認証コードを確認してください。';
    return '認証コードを送信してメール認証を完了してください。';
}

function generatePW() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return AppCrypto.randomString(8, chars);
}

function startResendCooldown() {
    let sec = 10;
    const resendBtn = document.getElementById('resend-code-btn');
    showEl(resendBtn);
    resendBtn.disabled = true;
    setEntryButton(resendBtn, `${sec}秒`, 'fa-solid fa-clock');
    clearInterval(resendCooldown);
    resendCooldown = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(resendCooldown);
            resendBtn.disabled = false;
            setEntryButton(resendBtn, '再送信', 'fa-solid fa-rotate-right');
        } else {
            setEntryButton(resendBtn, `${sec}秒`, 'fa-solid fa-clock');
        }
    }, 1000);
}

async function resendVerification() {
    const email = document.getElementById('f-email').value.trim();
    const resendBtn = document.getElementById('resend-code-btn');
    resendBtn.disabled = true;
    setEntryButton(resendBtn, '送信中...', 'fa-solid fa-spinner fa-spin');
    showVerifyMsg('認証コードを再送信しています...', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(email, pName, pName + ' 実行委員会');

    if (!result || !result.success) {
        showVerifyMsg('再送信に失敗しました。', 'error');
        resendBtn.disabled = false;
        setEntryButton(resendBtn, '再送信', 'fa-solid fa-rotate-right');
        return;
    }

    verifySignature = result.signature;
    verifyExpiresAt = result.expiresAt;
    document.getElementById('f-verify-code').value = '';
    showVerifyMsg(`${email} に認証コードを再送信しました。`, 'success');
    showVerificationMailboxHelp();
    startResendCooldown();
}

async function sendVerification() {
    const email = document.getElementById('f-email').value.trim();
    clearStatus();
    if (!email) {
        showVerifyMsg('メールアドレスを入力してください。', 'error');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showVerifyMsg('正しいメールアドレスを入力してください。', 'error');
        return;
    }

    const btn = document.getElementById('send-code-btn');
    btn.disabled = true;
    setEntryButton(btn, '送信中...', 'fa-solid fa-spinner fa-spin');
    showVerifyMsg('認証コードを送信しています...', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(email, pName, pName + ' 実行委員会');

    if (!result || !result.success) {
        showVerifyMsg('認証コードの送信に失敗しました。メールアドレスを確認してください。', 'error');
        btn.disabled = false;
        setEntryButton(btn, '認証コードを送信', 'fa-solid fa-paper-plane');
        return;
    }

    verifySignature = result.signature;
    verifyExpiresAt = result.expiresAt;
    document.getElementById('f-email').disabled = true;
    showEl(document.getElementById('code-input-area'));
    hideEl(btn);
    showVerifyMsg(`${email} に6桁の認証コードを送信しました。`, 'success');
    showVerificationMailboxHelp();
    document.getElementById('f-verify-code').focus();
    startResendCooldown();
}

async function verifyEmailCode() {
    const code = document.getElementById('f-verify-code').value.trim();
    const email = document.getElementById('f-email').value.trim();
    clearStatus();

    if (!code) {
        showVerifyMsg('認証コードを入力してください。', 'error');
        showVerificationMailboxHelp();
        return;
    }
    if (code.length !== 6) {
        showVerifyMsg('6桁の認証コードを入力してください。', 'error');
        showVerificationMailboxHelp();
        return;
    }

    const btn = document.getElementById('verify-code-btn');
    btn.disabled = true;
    setEntryButton(btn, '確認中...', 'fa-solid fa-spinner fa-spin');

    const verified = await CIQEmail.verifyCode(email, code, verifySignature, verifyExpiresAt);
    if (!verified) {
        showVerifyMsg('認証コードが正しくないか、有効期限が切れています。', 'error');
        showVerificationMailboxHelp();
        btn.disabled = false;
        setEntryButton(btn, '認証する', 'fa-solid fa-check-circle');
        return;
    }

    emailVerified = true;
    verifiedEmail = email;
    clearInterval(resendCooldown);
    clearVerifyMsg();
    clearVerifyHelp();
    clearStatus();
    hideEl(document.getElementById('email-verify-section'));
    showEl(document.getElementById('form-body'));
    document.getElementById('verified-email').textContent = email;

    sessionTimer = setTimeout(() => {
        emailVerified = false;
        verifiedEmail = '';
        hideEl(document.getElementById('form-body'));
        showEl(document.getElementById('email-verify-section'));
        document.getElementById('f-email').disabled = false;
        document.getElementById('f-email').value = '';
        document.getElementById('f-verify-code').value = '';
        hideEl(document.getElementById('code-input-area'));
        showEl(document.getElementById('send-code-btn'));
        document.getElementById('send-code-btn').disabled = false;
        setEntryButton(document.getElementById('send-code-btn'), '認証コードを送信', 'fa-solid fa-paper-plane');
        hideEl(document.getElementById('resend-code-btn'));
        showVerifyMsg('セッションの有効期限が切れました。再度メール認証を行ってください。', 'error');
    }, SESSION_TIMEOUT);
}

document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submit-btn');
    if (!emailVerified || !verifiedEmail) {
        showVerifyMsg(getPreVerificationSubmitMessage(), 'error');
        clearStatus();
        return;
    }

    const email = verifiedEmail;
    const familyName = document.getElementById('f-family-name').value.trim();
    const firstName = document.getElementById('f-first-name').value.trim();
    const familyNameKana = document.getElementById('f-family-kana').value.trim();
    const firstNameKana = document.getElementById('f-first-kana').value.trim();
    const affiliation = document.getElementById('f-affiliation').value.trim();
    const grade = document.getElementById('f-grade').value;
    const entryName = document.getElementById('f-entry-name').value.trim();
    const recordNamePermission = document.querySelector('input[name="f-record-name-permission"]:checked')?.value || '';
    const message = document.getElementById('f-message').value.trim();
    const inquiry = document.getElementById('f-inquiry').value.trim();
    const isChubu = document.getElementById('f-chubu').checked;
    const tosAccepted = document.getElementById('f-tos').checked;

    if (!familyName || !firstName || !familyNameKana || !firstNameKana || !affiliation || !grade || !entryName || !recordNamePermission || !tosAccepted) {
        showStatus('必須項目を入力してください。', 'error');
        return;
    }
    const form = e.currentTarget;
    if (!form.reportValidity()) {
        showStatus('必須項目を入力してください。', 'error');
        return;
    }
    if (!/^[ァ-ヴー]+$/.test(familyNameKana) || !/^[ァ-ヴー]+$/.test(firstNameKana)) {
        showStatus('カナは全角カタカナで入力してください。', 'error');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showStatus('正しいメールアドレスを入力してください。', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '処理中...';
    showStatus('エントリーを送信しています...', 'info');

    const pw = generatePW();
    try {
        const settings = supabasePublicSettingsCache || await loadPublicSettings();
        const publicKeyJwk = settings?.publicKey;
        if (!publicKeyJwk) throw new Error('セキュリティキーが取得できません');

        const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
        const pwHash = await AppCrypto.hashPassword(pw);
        const useEntryName = false;
        const allowRealNameInRecord = recordNamePermission === 'allow';
        const piiData = { email, familyName, firstName, familyNameKana, firstNameKana, affiliation, grade, entryName, useEntryName, allowRealNameInRecord, isChubu, message, inquiry };
        const encryptedPII = await AppCrypto.encryptRSA(JSON.stringify(piiData), publicKeyJwk);

        const entry = await CIQSupabaseAPI.createEntry({
            projectId,
            encryptedPii: encryptedPII,
            emailHash,
            disclosurePasswordHash: pwHash,
            publicProfile: { entryName, affiliation, grade, message, inquiry, isChubu },
        });

        const entryNumber = entry.entry_number || entry.entryNumber;
        const entryStatus = entry.status;
        const pName = document.getElementById('project-title').textContent || projectId;
        const baseUrl = new URL('.', window.location.href);
        const editUrl = new URL(`edit.html?pid=${encodeURIComponent(projectId)}`, baseUrl).href;
        const entryListUrl = new URL(`entry_list.html?pid=${encodeURIComponent(projectId)}`, baseUrl).href;

        CIQEmail.sendEntryConfirmation(email, {
            projectName: pName,
            entryNumber: String(entryNumber).padStart(3, '0'),
            password: pw,
            uuid: entry.id,
            emailHash,
            familyName,
            firstName,
            status: entryStatus,
            editUrl,
            entryListUrl,
            qrData: entry.id,
            senderName: pName + ' 実行委員会'
        }).catch(err => console.warn('メール送信スキップ:', err));

        hideEl(document.getElementById('form-card'));
        showEl(document.getElementById('result-card'));
        document.getElementById('r-entry-number').textContent = String(entryNumber).padStart(3, '0');
        hideEl(document.getElementById('status-msg'));

        if (entryStatus === 'waitlist') {
            showWaitlistMessage();
        }
    } catch (err) {
        console.error('Entry error:', err);
        btn.disabled = false;
        btn.textContent = 'エントリーを確定する';
        showStatus('エラーが発生しました: ' + err.message, 'error');
    }
});

function showWaitlistMessage() {
    const waitMsg = document.createElement('div');
    waitMsg.className = 'waitlist-result-note';
    const strong = document.createElement('strong');
    strong.textContent = 'キャンセル待ち';
    waitMsg.append(entryIcon('fa-solid fa-clock'), ' 定員に達したため、', strong, 'として登録されました。');
    document.getElementById('r-entry-number').parentElement.after(waitMsg);
}

document.getElementById('send-code-btn')?.addEventListener('click', sendVerification);
document.getElementById('verify-code-btn')?.addEventListener('click', verifyEmailCode);
document.getElementById('resend-code-btn')?.addEventListener('click', resendVerification);

async function init() {
    if (!projectId) {
        showDisabled('プロジェクトが指定されていません', '正しいエントリーURLへアクセスしてください。');
        return;
    }

    try {
        const settings = await loadPublicSettings();
        if (!settings) {
            showDisabled('プロジェクトが見つかりません', '正しいエントリーURLへアクセスしてください。');
            return;
        }

        const pName = settings.projectName || projectId;
        document.getElementById('project-title').textContent = pName;
        document.title = pName + ' - エントリーフォーム';

        const termsLink = document.getElementById('terms-link');
        if (termsLink) termsLink.href = `terms.html?pid=${projectId}`;

        let blocked = false;
        let blockTitle = '';
        let blockDetail = '';
        if (settings.entryOpen !== true) {
            blocked = true;
            blockTitle = 'エントリーは現在停止中です';
            blockDetail = '管理者がエントリーを再開するまでお待ちください。';
        } else {
            const now = Date.now();
            const startDt = settings.periodStart ? new Date(settings.periodStart) : null;
            const endDt = settings.periodEnd ? new Date(settings.periodEnd) : null;
            if (startDt && startDt.getTime() > now) {
                blocked = true;
                blockTitle = 'エントリーはまだ開始されていません';
                blockDetail = 'エントリー開始: ' + startDt.toLocaleString('ja-JP');
            }
            if (endDt && endDt.getTime() < now) {
                blocked = true;
                blockTitle = 'エントリーは終了しました';
                blockDetail = 'エントリー終了: ' + endDt.toLocaleString('ja-JP');
            }
        }
        if (blocked) showDisabled(blockTitle, blockDetail);
    } catch (e) {
        showDisabled('接続エラー', e.message || 'Supabaseに接続できませんでした。');
    }
}

init();
