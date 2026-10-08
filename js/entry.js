// entry.js - Supabase public entry form

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');
const isReentry = params.get('reentry') === '1';
let supabasePublicSettingsCache = null;

let emailVerified = false;
let verifiedEmail = '';
let verifySignature = '';
let verifyExpiresAt = 0;
let verifiedToken = '';   // メール認証済みトークン(メモリのみ・localStorageへ保存しない)
let resendCooldown = null;
let sessionTimer = null;
// サーバーのメール認証トークン(30分)より少しだけ短くする。これより長く画面側だけ先にリセットすると、有効なのに最初からになる。
const SESSION_TIMEOUT = 29 * 60 * 1000;

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
    setPageMessage(el, msg, type || 'info');
    if (type === 'error' && shouldShowVerificationMailboxHelp()) showVerificationMailboxHelp();
}

function clearVerifyMsg() {
    clearPageMessage(document.getElementById('verify-msg'));
}

function showVerifyHelp(msg) {
    const el = document.getElementById('verify-help-msg');
    if (!el) return;
    setPageMessage(el, msg, 'warning');
    el.classList.remove('u-hidden');
}

function clearVerifyHelp() {
    const el = document.getElementById('verify-help-msg');
    if (!el) return;
    clearPageMessage(el);
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

// 6桁そろったら「認証する」を押したのと同じ扱いにする(入力・貼り付け・メールの自動入力のどれでも)。
function autoVerifyIfComplete() {
    syncVerifyCodeFromBoxes();
    const code = document.getElementById('f-verify-code')?.value || '';
    const verifyButton = document.getElementById('verify-code-btn');
    if (code.length === 6 && verifyButton && !verifyButton.disabled) verifyEmailCode();
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
                autoVerifyIfComplete();
                return;
            }
            input.value = digits;
            syncVerifyCodeFromBoxes();
            if (digits && index < boxes.length - 1) focusVerifyCodeBox(index + 1);
            autoVerifyIfComplete();
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                syncVerifyCodeFromBoxes();
                const verifyButton = document.getElementById('verify-code-btn');
                if (!verifyButton?.disabled) verifyEmailCode();
                return;
            }
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
            autoVerifyIfComplete();
        });
    });
}

function showStatus(msg, type) {
    setPageMessage(document.getElementById('status-msg'), msg, type || 'info');
}

function clearStatus() {
    clearPageMessage(document.getElementById('status-msg'));
}

function getPreVerificationSubmitMessage() {
    const email = normalizeEmailInput(document.getElementById('f-email').value);
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
    let sec = 60;
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
    const email = normalizeEmailInput(document.getElementById('f-email').value);
    const resendBtn = document.getElementById('resend-code-btn');
    resendBtn.disabled = true;
    setEntryButton(resendBtn, '送信中…', 'spinner');
    showVerifyMsg('認証コードを再送信しています…', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    // Turnstile トークンはワンタイム。送信のたびに取得し、結果に関わらず reset して次回分を発行させる。
    const result = await CIQEmail.sendVerificationCode(
        email, pName, pName + ' 実行委員会', CIQTurnstile.token('turnstile-verify'),
    );
    CIQTurnstile.reset('turnstile-verify');

    if (!result || !result.success) {
        showVerifyMsg(result?.error || '認証コードを再送信できませんでした。時間をおいて再度お試しください。', 'error');
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
    const email = normalizeEmailInput(document.getElementById('f-email').value);
    document.getElementById('f-email').value = email;   // 全角を直した結果を入力欄にも反映する
    clearStatus();
    // 新規にコードを送るときは、以前の認証済み状態とトークンを破棄する。
    clearEmailVerification();
    if (!email) {
        showVerifyMsg('メールアドレスを入力してください。', 'error');
        return;
    }
    if (!isValidEmailAddress(email)) {
        showVerifyMsg('正しいメールアドレスを入力してください。全角の文字や空白が入っていないかご確認ください。', 'error');
        return;
    }

    const btn = document.getElementById('send-code-btn');
    btn.disabled = true;
    setEntryButton(btn, '送信中…', 'spinner');
    showVerifyMsg('認証コードを送信しています…', '');

    const pName = document.getElementById('project-title')?.textContent || projectId;
    const result = await CIQEmail.sendVerificationCode(
        email, pName, pName + ' 実行委員会', CIQTurnstile.token('turnstile-verify'),
    );
    CIQTurnstile.reset('turnstile-verify');

    if (!result || !result.success) {
        showVerifyMsg(result?.error || '認証コードを送信できませんでした。メールアドレスをご確認のうえ、時間をおいて再度お試しください。', 'error');
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
    const email = normalizeEmailInput(document.getElementById('f-email').value);
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
    setEntryButton(btn, '確認中…', 'spinner');

    const result = await CIQEmail.verifyCode(email, code, verifySignature, verifyExpiresAt, projectId);
    if (!result.verified || !result.emailVerifiedToken) {
        clearEmailVerification();
        showVerifyMsg('認証コードが正しくないか、有効期限が切れています。入力内容をご確認いただくか、認証コードを再送信してください。', 'error');
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
        returnToEmailVerification('セッションの有効期限が切れました。再度メール認証を行ってください。');
    }, SESSION_TIMEOUT);
}

// フォームを閉じて、メール認証のやり直しに戻す（時間切れ・サーバーに認証を認められなかったとき）。
function returnToEmailVerification(message) {
    clearEmailVerification();
    if (sessionTimer) clearTimeout(sessionTimer);
    clearInterval(resendCooldown);
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
    clearStatus();
    showVerifyMsg(message, 'error');
}

// 確定前の確認サマリー — details を開いたときに入力内容を要約する
function renderEntryConfirmSummary() {
    const list = document.getElementById('entry-confirm-list');
    if (!list) return;
    const val = (id) => document.getElementById(id)?.value?.trim() || '';
    const rows = [
        ['氏名', `${val('f-family-name')} ${val('f-first-name')}`.trim()],
        ['カナ', `${val('f-family-kana')} ${val('f-first-kana')}`.trim()],
        ['所属 / 学年', [val('f-affiliation'), val('f-grade')].filter(Boolean).join(' / ')],
        ['中部地方', document.getElementById('f-chubu')?.checked ? 'はい' : 'いいえ'],
        ['エントリーネーム', val('f-entry-name')],
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
    // 送信中は、ボタン以外から（Enter や別の呼び出しで）もう一度来ても受け付けない。二重に登録されない。
    if (btn.disabled) return;
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
    const message = document.getElementById('f-message').value.trim();
    const inquiry = document.getElementById('f-inquiry').value.trim();
    const isChubu = document.getElementById('f-chubu').checked;

    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    if (!/^[ァ-ヴー]+$/.test(familyNameKana) || !/^[ァ-ヴー]+$/.test(firstNameKana)) {
        showStatus('カナは全角カタカナで入力してください。', 'error');
        return;
    }
    if (!isValidEmailAddress(email)) {
        showStatus('正しいメールアドレスを入力してください。全角の文字や空白が入っていないかご確認ください。', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '処理中…';
    showStatus('エントリーを送信しています…', 'info');

    const pw = generatePW();
    try {
        const settings = supabasePublicSettingsCache || await loadPublicSettings();
        const publicKeyJwk = settings?.publicKey;
        if (!publicKeyJwk) throw new Error('セキュリティキーが取得できません');

        const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
        const pwHash = await AppCrypto.hashPassword(pw);
        const piiData = { email, familyName, firstName, familyNameKana, firstNameKana, affiliation, grade, entryName, isChubu, message, inquiry };
        const encryptedPII = await AppCrypto.encryptRSA(JSON.stringify(piiData), publicKeyJwk);

        const entry = await CIQSupabaseAPI.createEntry({
            projectId,
            encryptedPii: encryptedPII,
            emailHash,
            disclosurePasswordHash: pwHash,
            emailVerifiedToken: verifiedToken,
            turnstileToken: CIQTurnstile.token('turnstile-entry'),
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
        }).catch((err) => {
            // パスワードは確認メールにしか載らない。送れなかったことを完了画面で伝え、再発行への道を示す。
            console.warn('確認メールを送信できませんでした:', err);
            showConfirmationMailFailure();
        });

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
        // 送信済みトークンはワンタイム。失敗時は必ず reset して再試行できるようにする。
        CIQTurnstile.reset('turnstile-entry');
        btn.disabled = false;
        btn.textContent = 'エントリーを確定する';
        // サーバーや通信の日本語エラーだけを表示し、それ以外(内部の例外)は汎用の文言にする。
        const known = err && (err.functionName || err.status !== undefined);
        // メール認証をサーバーに認められなかったときは、何度送っても同じなので、本人確認からやり直させる。
        if (known && (err.status === 401 || (err.status === 400 && /メール認証/.test(err.message || '')))) {
            returnToEmailVerification(err.message);
            return;
        }
        showStatus(known ? err.message : 'エントリーを送信できませんでした。時間をおいて再度お試しください。', 'error');
    }
});

function showConfirmationMailFailure() {
    const desc = document.querySelector('#result-card .result-desc');
    if (desc) desc.textContent = '確認メールを送信できませんでした。';
    const note = document.createElement('div');
    note.className = 'page-msg';
    note.setAttribute('role', 'alert');
    setPageMessage(note, 'パスワードと二次元コードは、マイエントリーで確認できます。パスワードが分からないときは、マイエントリーの「パスワードを忘れた場合」から、再発行してください。', 'warning');
    desc?.after(note);
}

function showWaitlistMessage() {
    const waitMsg = document.createElement('div');
    waitMsg.className = 'waitlist-result-note';
    const strong = document.createElement('strong');
    strong.textContent = 'キャンセル待ち';
    // flex の gap でテキストと太字の間が空かないよう、文章全体を1つの要素にまとめる。
    const text = document.createElement('span');
    text.append('定員に達したため、', strong, 'として登録されました。');
    waitMsg.append(entryIcon('clock'), text);
    document.getElementById('r-entry-number').parentElement.after(waitMsg);
}

document.getElementById('send-code-btn')?.addEventListener('click', sendVerification);
document.getElementById('verify-code-btn')?.addEventListener('click', verifyEmailCode);
document.getElementById('resend-code-btn')?.addEventListener('click', resendVerification);
// メールアドレスが編集されたら、保持中の認証済み状態・トークンを破棄する(防御的)。
document.getElementById('f-email')?.addEventListener('change', (event) => {
    event.target.value = normalizeEmailInput(event.target.value);
});
document.getElementById('f-email')?.addEventListener('input', () => {
    if (emailVerified || verifiedToken) clearEmailVerification();
});
setupVerifyCodeBoxes();

async function init() {
    setEntryStepState('verify');
    // Turnstile widget を描画(site key 未設定 / API 読込失敗時は描画されず、サーバ側 fail-closed が守る)。
    CIQTurnstile.render('turnstile-verify', 'send_verification');
    CIQTurnstile.render('turnstile-entry', 'create_entry');
    if (isReentry) {
        const note = document.getElementById('reentry-note');
        showEl(note);
        note?.classList.add('is-visible');
    }
    if (!projectId) {
        showDisabled('大会が指定されていません', '正しいエントリーURLへアクセスしてください。');
        return;
    }

    try {
        const settings = await loadPublicSettings();
        if (!settings) {
            showDisabled('大会が見つかりません', '正しいエントリーURLへアクセスしてください。');
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
            blockDetail = '運営がエントリーを再開するまでお待ちください。';
        } else {
            const now = Date.now();
            const startDt = settings.periodStart ? new Date(settings.periodStart) : null;
            const endDt = settings.periodEnd ? new Date(settings.periodEnd) : null;
            if (startDt && startDt.getTime() > now) {
                blocked = true;
                blockTitle = 'エントリーはまだ開始されていません';
                blockDetail = 'エントリー開始：' + formatDateTimeJa(startDt);
            }
            if (endDt && endDt.getTime() < now) {
                blocked = true;
                blockTitle = 'エントリーは終了しました';
                blockDetail = 'エントリー終了：' + formatDateTimeJa(endDt);
            }
        }
        if (blocked) showDisabled(blockTitle, blockDetail);
    } catch (e) {
        // 参加者向けの画面なので、内部のエラー文は出さずコンソールにだけ残す。
        console.error(e);
        showDisabled('大会情報を読み込めませんでした', '時間をおいて再度お試しください。');
    }
}

init();
