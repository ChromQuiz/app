// entry.js - Supabase public entry form

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');
let supabasePublicSettingsCache = null;

let emailVerified = false;
let verifiedEmail = '';
let verifySignature = '';
let verifyExpiresAt = 0;
let verifiedToken = '';   // メール認証済みトークン(メモリのみ・localStorageへ保存しない)
let resendCooldown = null;
let sessionTimer = null;
const SESSION_TIMEOUT = 10 * 60 * 1000;

// メール認証済み状態・メール・トークンを同時に破棄する(メモリのみ)。
// メール変更/再送/タイムアウト/登録成功/フォームリセット/認証失敗など全ての破棄点で使う。
function clearEmailVerification() {
    emailVerified = false;
    verifiedEmail = '';
    verifiedToken = '';
}

function showEl(el) {
    el?.classList.remove('u-hidden');
}

function hideEl(el) {
    el?.classList.add('u-hidden');
}

function entryIcon(className) {
    const icon = createIcon(className);
    return icon;
}

function setEntryButton(button, text, iconClass = '') {
    if (!button) return;
    button.textContent = '';
    if (iconClass) button.append(entryIcon(iconClass), ' ');
    button.appendChild(document.createTextNode(text));
}

function setEntryStepState(state) {
    const steps = Array.from(document.querySelectorAll('.entry-step'));
    const order = ['verify', 'form', 'done'];
    const activeIndex = order.indexOf(state);
    steps.forEach((step, index) => {
        step.classList.remove('is-active', 'is-complete');
        if (state === 'done' || index < activeIndex) {
            step.classList.add('is-complete');
        } else if (index === activeIndex) {
            step.classList.add('is-active');
        }
    });
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
    if (type === 'error' && shouldShowVerificationMailboxHelp()) showVerificationMailboxHelp();
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
    el.textContent = '';
    el.append(entryIcon('triangle-exclamation'), document.createTextNode(msg));
    el.classList.remove('u-hidden');
}

function clearVerifyHelp() {
    const el = document.getElementById('verify-help-msg');
    if (!el) return;
    el.textContent = '';
    el.classList.add('u-hidden');
}

function showVerificationMailboxHelp() {
    showVerifyHelp('メールが届かない場合は、迷惑メールフォルダを必ず確認してください。');
}

function shouldShowVerificationMailboxHelp() {
    const codeArea = document.getElementById('code-input-area');
    return Boolean(codeArea && !codeArea.classList.contains('u-hidden'));
}

function getVerifyCodeBoxes() {
    return Array.from(document.querySelectorAll('.verify-code-box'));
}

function syncVerifyCodeFromBoxes() {
    const hiddenInput = document.getElementById('f-verify-code');
    if (!hiddenInput) return;
    hiddenInput.value = getVerifyCodeBoxes().map(input => input.value).join('');
}

function setVerifyCodeValue(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 6).split('');
    getVerifyCodeBoxes().forEach((input, index) => {
        input.value = digits[index] || '';
    });
    syncVerifyCodeFromBoxes();
}

function focusVerifyCodeBox(index = 0) {
    const boxes = getVerifyCodeBoxes();
    boxes[Math.max(0, Math.min(index, boxes.length - 1))]?.focus();
}

function setupVerifyCodeBoxes() {
    const boxes = getVerifyCodeBoxes();
    boxes.forEach((input, index) => {
        input.addEventListener('input', () => {
            const digits = input.value.replace(/\D/g, '');
            if (digits.length > 1) {
                const current = getVerifyCodeBoxes().map(box => box.value).join('');
                setVerifyCodeValue(current.slice(0, index) + digits + current.slice(index + 1));
                focusVerifyCodeBox(Math.min(index + digits.length, boxes.length - 1));
                return;
            }
            input.value = digits;
            syncVerifyCodeFromBoxes();
            if (digits && index < boxes.length - 1) focusVerifyCodeBox(index + 1);
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace' && !input.value && index > 0) {
                event.preventDefault();
                boxes[index - 1].value = '';
                syncVerifyCodeFromBoxes();
                focusVerifyCodeBox(index - 1);
            }
        });
        input.addEventListener('paste', (event) => {
            const text = event.clipboardData?.getData('text') || '';
            if (!text) return;
            event.preventDefault();
            setVerifyCodeValue(text);
            focusVerifyCodeBox(Math.min(text.replace(/\D/g, '').length, boxes.length - 1));
        });
    });
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
    setEntryButton(resendBtn, `${sec}秒`, 'clock');
    clearInterval(resendCooldown);
    resendCooldown = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(resendCooldown);
            resendBtn.disabled = false;
            setEntryButton(resendBtn, '再送信', 'rotate-right');
        } else {
            setEntryButton(resendBtn, `${sec}秒`, 'clock');
        }
    }, 1000);
}

async function resendVerification() {
    // 再送は新しいコードを発行するため、以前の認証済み状態とトークンを破棄する。
    clearEmailVerification();
    const email = document.getElementById('f-email').value.trim();
    const resendBtn = document.getElementById('resend-code-btn');
    resendBtn.disabled = true;
    setEntryButton(resendBtn, '送信中...', 'spinner');
    showVerifyMsg('認証コードを再送信しています...', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(email, pName, pName + ' 実行委員会');

    if (!result || !result.success) {
        showVerifyMsg('再送信に失敗しました。', 'error');
        resendBtn.disabled = false;
        setEntryButton(resendBtn, '再送信', 'rotate-right');
        return;
    }

    verifySignature = result.signature;
    verifyExpiresAt = result.expiresAt;
    setVerifyCodeValue('');
    showVerifyMsg(`${email} に認証コードを送信しました。`, 'success');
    showVerificationMailboxHelp();
    startResendCooldown();
}

async function sendVerification() {
    const email = document.getElementById('f-email').value.trim();
    clearStatus();
    // 新規にコードを送るときは、以前の認証済み状態とトークンを破棄する。
    clearEmailVerification();
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
    setEntryButton(btn, '送信中...', 'spinner');
    showVerifyMsg('認証コードを送信しています...', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(email, pName, pName + ' 実行委員会');

    if (!result || !result.success) {
        showVerifyMsg('認証コードの送信に失敗しました。メールアドレスを確認してください。', 'error');
        btn.disabled = false;
        setEntryButton(btn, '認証コードを送信', 'paper-plane');
        return;
    }

    verifySignature = result.signature;
    verifyExpiresAt = result.expiresAt;
    document.getElementById('f-email').disabled = true;
    showEl(document.getElementById('code-input-area'));
    hideEl(btn);
    showVerifyMsg(`${email} に認証コードを送信しました。`, 'success');
    showVerificationMailboxHelp();
    focusVerifyCodeBox(0);
    startResendCooldown();
}

async function verifyEmailCode() {
    const code = document.getElementById('f-verify-code').value.trim();
    const email = document.getElementById('f-email').value.trim();
    clearStatus();

    if (!code) {
        showVerifyMsg('認証コードを入力してください。', 'error');
        return;
    }
    if (code.length !== 6) {
        showVerifyMsg('6桁の認証コードを入力してください。', 'error');
        return;
    }

    const btn = document.getElementById('verify-code-btn');
    btn.disabled = true;
    setEntryButton(btn, '確認中...', 'spinner');

    const result = await CIQEmail.verifyCode(email, code, verifySignature, verifyExpiresAt, projectId);
    if (!result.verified || !result.emailVerifiedToken) {
        clearEmailVerification();
        showVerifyMsg('認証コードが正しくないか、有効期限が切れています。', 'error');
        btn.disabled = false;
        setEntryButton(btn, '認証する', 'check-circle');
        return;
    }

    emailVerified = true;
    verifiedEmail = email;
    verifiedToken = result.emailVerifiedToken;
    clearInterval(resendCooldown);
    clearVerifyMsg();
    clearVerifyHelp();
    clearStatus();
    hideEl(document.getElementById('email-verify-section'));
    showEl(document.getElementById('form-body'));
    setEntryStepState('form');
    document.getElementById('verified-email').textContent = email;

    sessionTimer = setTimeout(() => {
        clearEmailVerification();
        hideEl(document.getElementById('form-body'));
        showEl(document.getElementById('email-verify-section'));
        document.getElementById('f-email').disabled = false;
        document.getElementById('f-email').value = '';
        setVerifyCodeValue('');
        hideEl(document.getElementById('code-input-area'));
        showEl(document.getElementById('send-code-btn'));
        setEntryStepState('verify');
        document.getElementById('send-code-btn').disabled = false;
        setEntryButton(document.getElementById('send-code-btn'), '認証コードを送信', 'paper-plane');
        hideEl(document.getElementById('resend-code-btn'));
        showVerifyMsg('セッションの有効期限が切れました。再度メール認証を行ってください。', 'error');
    }, SESSION_TIMEOUT);
}

// 確定前の確認サマリー — details を開いたときに入力内容を要約する
function renderEntryConfirmSummary() {
    const list = document.getElementById('entry-confirm-list');
    if (!list) return;
    const val = (id) => document.getElementById(id)?.value?.trim() || '';
    const permission = document.querySelector('input[name="f-record-name-permission"]:checked');
    const rows = [
        ['氏名', `${val('f-family-name')} ${val('f-first-name')}`.trim()],
        ['カナ', `${val('f-family-kana')} ${val('f-first-kana')}`.trim()],
        ['所属 / 学年', [val('f-affiliation'), val('f-grade')].filter(Boolean).join(' / ')],
        ['中部地方', document.getElementById('f-chubu')?.checked ? 'はい' : 'いいえ'],
        ['エントリーネーム', val('f-entry-name')],
        ['記録集での本名使用', permission ? (permission.value === 'allow' ? '許可する' : '許可しない') : ''],
        ['意気込み', val('f-message')],
        ['運営への連絡', val('f-inquiry')],
    ];
    list.textContent = '';
    rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'entry-confirm-row';
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value || '—';
        row.append(dt, dd);
        list.appendChild(row);
    });
}

document.getElementById('entry-confirm')?.addEventListener('toggle', (event) => {
    if (event.target.open) renderEntryConfirmSummary();
});

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
            emailVerifiedToken: verifiedToken,
            publicProfile: { entryName, affiliation, grade, message, inquiry, isChubu },
        });

        const entryNumber = entry.entry_number || entry.entryNumber;
        const entryStatus = entry.status;
        const pName = document.getElementById('project-title').textContent || projectId;
        const baseUrl = new URL('.', window.location.href);
        const entryListUrl = new URL(`entry_list.html?pid=${encodeURIComponent(projectId)}`, baseUrl).href;

        CIQEmail.sendEntryConfirmation(email, {
            projectName: pName,
            entryNumber: String(entryNumber).padStart(3, '0'),
            password: pw,
            uuid: entry.id,
            familyName,
            firstName,
            status: entryStatus,
            entryListUrl,
            qrData: entry.id,
            senderName: pName + ' 実行委員会'
        }).catch(err => console.warn('メール送信スキップ:', err));

        // 登録成功でトークンは役目を終えるため破棄する。
        clearEmailVerification();
        if (sessionTimer) clearTimeout(sessionTimer);
        hideEl(document.getElementById('form-card'));
        showEl(document.getElementById('result-card'));
        setEntryStepState('done');
        const myLink = document.getElementById('r-my-link');
        if (myLink) myLink.href = new URL(`my.html?pid=${encodeURIComponent(projectId)}`, baseUrl).href;
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
    waitMsg.append(entryIcon('clock'), ' 定員に達したため、', strong, 'として登録されました。');
    document.getElementById('r-entry-number').parentElement.after(waitMsg);
}

document.getElementById('send-code-btn')?.addEventListener('click', sendVerification);
document.getElementById('verify-code-btn')?.addEventListener('click', verifyEmailCode);
document.getElementById('resend-code-btn')?.addEventListener('click', resendVerification);
// メールアドレスが編集されたら、保持中の認証済み状態・トークンを破棄する(防御的)。
document.getElementById('f-email')?.addEventListener('input', () => {
    if (emailVerified || verifiedToken) clearEmailVerification();
});
setupVerifyCodeBoxes();

async function init() {
    setEntryStepState('verify');
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
