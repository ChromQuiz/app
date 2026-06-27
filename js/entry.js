// entry.js - Supabase public entry form

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');
let globalReplyTo = null;
let supabasePublicSettingsCache = null;

let emailVerified = false;
let verifiedEmail = '';
let verifySignature = '';
let verifyExpiresAt = 0;
let resendCooldown = null;
let sessionTimer = null;
const SESSION_TIMEOUT = 10 * 60 * 1000;

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
    document.getElementById('form-card').style.display = 'none';
    document.getElementById('disabled-title').textContent = title;
    document.getElementById('disabled-detail').textContent = detail;
    document.getElementById('disabled-card').style.display = 'block';
}

function showVerifyMsg(msg, type) {
    const el = document.getElementById('verify-msg');
    el.textContent = msg;
    el.className = `page-msg ${type}`;
    el.style.display = 'block';
}

function showStatus(msg, type) {
    const sm = document.getElementById('status-msg');
    sm.textContent = msg;
    sm.className = `page-msg ${type}`;
    sm.style.display = 'block';
}

function generatePW() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return AppCrypto.randomString(8, chars);
}

function startResendCooldown() {
    let sec = 10;
    const resendBtn = document.getElementById('resend-code-btn');
    resendBtn.style.display = 'inline-block';
    resendBtn.disabled = true;
    resendBtn.innerHTML = `<i class="fa-solid fa-clock"></i> 再送信（${sec}秒）`;
    clearInterval(resendCooldown);
    resendCooldown = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(resendCooldown);
            resendBtn.disabled = false;
            resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 認証コードを再送信';
        } else {
            resendBtn.innerHTML = `<i class="fa-solid fa-clock"></i> 再送信（${sec}秒）`;
        }
    }, 1000);
}

async function resendVerification() {
    const email = document.getElementById('f-email').value.trim();
    const resendBtn = document.getElementById('resend-code-btn');
    resendBtn.disabled = true;
    resendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';
    showVerifyMsg('認証コードを再送信しています...', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(email, pName, pName + ' 実行委員会', globalReplyTo);

    if (!result || !result.success) {
        showVerifyMsg('再送信に失敗しました。', 'error');
        resendBtn.disabled = false;
        resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 認証コードを再送信';
        return;
    }

    verifySignature = result.signature;
    verifyExpiresAt = result.expiresAt;
    document.getElementById('f-verify-code').value = '';
    showVerifyMsg(`${email} に認証コードを再送信しました。`, 'success');
    startResendCooldown();
}

async function sendVerification() {
    const email = document.getElementById('f-email').value.trim();
    if (!email || !email.includes('@')) {
        showVerifyMsg('有効なメールアドレスを入力してください。', 'error');
        return;
    }

    const btn = document.getElementById('send-code-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';
    showVerifyMsg('認証コードを送信しています...', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(email, pName, pName + ' 実行委員会', globalReplyTo);

    if (!result || !result.success) {
        showVerifyMsg('認証コードの送信に失敗しました。メールアドレスを確認してください。', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 認証コードを送信';
        return;
    }

    verifySignature = result.signature;
    verifyExpiresAt = result.expiresAt;
    document.getElementById('f-email').disabled = true;
    document.getElementById('code-input-area').style.display = 'block';
    btn.style.display = 'none';
    showVerifyMsg(`${email} に6桁の認証コードを送信しました。`, 'success');
    document.getElementById('f-verify-code').focus();
    startResendCooldown();
}

async function verifyEmailCode() {
    const code = document.getElementById('f-verify-code').value.trim();
    const email = document.getElementById('f-email').value.trim();

    if (!code || code.length !== 6) {
        showVerifyMsg('6桁の認証コードを入力してください。', 'error');
        return;
    }

    const btn = document.getElementById('verify-code-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 確認中...';

    const verified = await CIQEmail.verifyCode(email, code, verifySignature, verifyExpiresAt);
    if (!verified) {
        showVerifyMsg('認証コードが正しくないか、有効期限が切れています。', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> 認証する';
        return;
    }

    emailVerified = true;
    verifiedEmail = email;
    clearInterval(resendCooldown);
    document.getElementById('email-verify-section').style.display = 'none';
    document.getElementById('form-body').style.display = 'block';
    document.getElementById('verified-email').textContent = email;

    sessionTimer = setTimeout(() => {
        emailVerified = false;
        verifiedEmail = '';
        document.getElementById('form-body').style.display = 'none';
        document.getElementById('email-verify-section').style.display = 'block';
        document.getElementById('f-email').disabled = false;
        document.getElementById('f-email').value = '';
        document.getElementById('f-verify-code').value = '';
        document.getElementById('code-input-area').style.display = 'none';
        document.getElementById('send-code-btn').style.display = '';
        document.getElementById('send-code-btn').disabled = false;
        document.getElementById('send-code-btn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> 認証コードを送信';
        document.getElementById('resend-code-btn').style.display = 'none';
        showVerifyMsg('セッションの有効期限が切れました。再度メール認証を行ってください。', 'error');
    }, SESSION_TIMEOUT);
}

document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submit-btn');
    if (!emailVerified || !verifiedEmail) {
        showStatus('メールアドレスの認証を先に完了してください。', 'error');
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
    const message = document.getElementById('f-message').value.trim();
    const inquiry = document.getElementById('f-inquiry').value.trim();
    const isChubu = document.getElementById('f-chubu').checked;

    if (!email || !familyName || !firstName) {
        showStatus('メールアドレス・姓名は必須項目です。', 'error');
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
        const piiData = { email, familyName, firstName, familyNameKana, firstNameKana, affiliation, grade, entryName, useEntryName, isChubu, message, inquiry };
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
        const editUrl = `${window.location.origin}${window.location.pathname.replace('entry.html', '')}edit.html?pid=${projectId}`;

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
            senderName: pName + ' 実行委員会',
            replyTo: globalReplyTo
        }).catch(err => console.warn('メール送信スキップ:', err));

        document.getElementById('form-card').style.display = 'none';
        document.getElementById('result-card').style.display = 'block';
        document.getElementById('r-entry-number').textContent = String(entryNumber).padStart(3, '0');
        document.getElementById('status-msg').style.display = 'none';

        if (entryStatus === 'waitlist') {
            const waitMsg = document.createElement('div');
            waitMsg.className = 'status-msg warning';
            waitMsg.innerHTML = '<i class="fa-solid fa-clock"></i> 定員に達したため、<strong>キャンセル待ち</strong>として登録されました。';
            waitMsg.style.cssText = 'display:block;margin:12px 0;padding:12px 16px;background:var(--warning-soft);border:1px solid rgba(183,121,31,0.26);border-radius:8px;color:var(--warning);font-size:13px;';
            document.getElementById('r-entry-number').parentElement.after(waitMsg);
        }
    } catch (err) {
        console.error('Entry error:', err);
        btn.disabled = false;
        btn.textContent = 'エントリーを確定する';
        showStatus('エラーが発生しました: ' + err.message, 'error');
    }
});

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
        globalReplyTo = settings.replyTo || null;

        const termsLink = document.getElementById('terms-link');
        if (termsLink) termsLink.href = `terms.html?pid=${projectId}`;

        let blocked = false;
        let blockTitle = '';
        let blockDetail = '';
        if (settings.entryOpen !== true) {
            blocked = true;
            blockTitle = '受付は現在停止中です';
            blockDetail = '管理者が受付を再開するまでお待ちください。';
        } else {
            const now = Date.now();
            const startDt = settings.periodStart ? new Date(settings.periodStart) : null;
            const endDt = settings.periodEnd ? new Date(settings.periodEnd) : null;
            if (startDt && startDt.getTime() > now) {
                blocked = true;
                blockTitle = 'エントリー受付はまだ開始されていません';
                blockDetail = '受付開始: ' + startDt.toLocaleString('ja-JP');
            }
            if (endDt && endDt.getTime() < now) {
                blocked = true;
                blockTitle = 'エントリー受付は終了しました';
                blockDetail = '受付終了: ' + endDt.toLocaleString('ja-JP');
            }
        }
        if (blocked) showDisabled(blockTitle, blockDetail);
    } catch (e) {
        showDisabled('接続エラー', e.message || 'Supabaseに接続できませんでした。');
    }
}

init();
