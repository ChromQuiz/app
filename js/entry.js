// entry.js — エントリーフォーム（Firebase SDK版）
// 受付番号の採番には SDK トランザクションを使用し、競合を完全に防止する。

const params = new URLSearchParams(location.search);
        const projectId = params.get('pid');
        let globalReplyTo = null;

        if (!projectId) {
            document.getElementById('form-card').style.display = 'none';
            const d = document.getElementById('disabled-card');
            d.innerHTML = '<p>プロジェクトが指定されていません。</p><p style="margin-top:8px;font-size:13px">正しいエントリーURLへアクセスしてください。</p>';
            d.style.display = 'block';
        }

        function generateUUID() {
            return AppCrypto.randomUUID();
        }

        // メール認証状態
        let emailVerified = false;
        let verifiedEmail = '';
        let verifySignature = '';
        let verifyExpiresAt = 0;
        let resendCooldown = null;
        let sessionTimer = null;
        const SESSION_TIMEOUT = 10 * 60 * 1000; // 認証後10分でリセット

        function showVerifyMsg(msg, type) {
            const el = document.getElementById('verify-msg');
            el.innerHTML = msg;
            el.className = `page-msg ${type}`;
            el.style.display = 'block';
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
            showVerifyMsg(`<i class="fa-solid fa-envelope-circle-check"></i> ${email} に認証コードを再送信しました。`, 'success');
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
            showVerifyMsg(`<i class="fa-solid fa-envelope-circle-check"></i> ${email} に6桁の認証コードを送信しました。`, 'success');
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

            // 認証成功
            emailVerified = true;
            verifiedEmail = email;
            clearInterval(resendCooldown);
            document.getElementById('email-verify-section').style.display = 'none';
            document.getElementById('form-body').style.display = 'block';
            document.getElementById('verified-email').textContent = email;

            // セッションタイムアウト（10分後にリセット）
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
                showVerifyMsg('<i class="fa-solid fa-clock"></i> セッションの有効期限が切れました。再度メール認証を行ってください。', 'error');
            }, SESSION_TIMEOUT);
        }

        function generatePW() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
            return AppCrypto.randomString(8, chars);
        }

        function showStatus(msg, type) {
            const sm = document.getElementById('status-msg');
            sm.textContent = msg;
            sm.className = `page-msg ${type}`;
            sm.style.display = 'block';
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

            // バリデーション
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

            const affiliation = document.getElementById('f-affiliation').value.trim();
            const grade = document.getElementById('f-grade').value;
            const entryName = document.getElementById('f-entry-name').value.trim();
            const message = document.getElementById('f-message').value.trim();
            const inquiry = document.getElementById('f-inquiry').value.trim();

            const uuid = generateUUID();
            const pw = generatePW();

            try {
                // メール重複チェック
                const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
                const existing = await dbQuery(
                    `projects/${projectId}/entries`,
                    'emailHash', emailHash
                );
                if (existing) {
                    const activeEntry = Object.values(existing).find(e => e.status !== 'canceled');
                    if (activeEntry) {
                        throw new Error('このメールアドレスは既にエントリー済みです。');
                    }
                }

                // SDK トランザクションで受付番号をアトミックに取得
                const txResult = await dbTransaction(
                    `projects/${projectId}/publicSettings/lastEntryNumber`,
                    (currentValue) => (currentValue || 0) + 1
                );

                if (!txResult.committed) {
                    throw new Error("受付番号の取得に失敗しました。再度お試しください。");
                }

                const entryNumber = txResult.value;
                const pwHash = await AppCrypto.hashPassword(pw);

                // 定員チェック
                const pubSettings = await dbGet(`projects/${projectId}/publicSettings`);
                const maxEntries = pubSettings?.maxEntries || 0;
                let entryStatus = 'registered';
                if (maxEntries > 0) {
                    const allEntries = await dbGet(`projects/${projectId}/entries`);
                    const activeCount = allEntries
                        ? Object.values(allEntries).filter(e => e.status === 'registered').length
                        : 0;
                    if (activeCount >= maxEntries) {
                        entryStatus = 'waitlist';
                    }
                }

                // 公開鍵を取得してPIIを暗号化
                const publicKeyJwk = await dbGet(`projects/${projectId}/publicSettings/publicKey`);
                if (!publicKeyJwk) throw new Error("セキュリティキーが取得できません");
                const useEntryName = false; // CIQ大会は本名表示固定
                const isChubu = document.getElementById('f-chubu').checked;
                
                const piiData = { email, familyName, firstName, familyNameKana, firstNameKana, affiliation, grade, entryName, useEntryName, isChubu, message, inquiry };
                const encryptedPII = await AppCrypto.encryptRSA(JSON.stringify(piiData), publicKeyJwk);


                const entryData = {
                    uuid,
                    entryNumber,
                    encryptedPII,
                    emailHash,
                    disclosurePw: pwHash,
                    // 公開フィールド（エントリーリスト表示用）
                    entryName,
                    affiliation,
                    grade,
                    message,
                    isChubu,
                    status: entryStatus,
                    checkedIn: false,
                    timestamp: SERVER_TIMESTAMP
                };


                // DBに保存
                await dbSet(`projects/${projectId}/entries/${uuid}`, entryData);

                // メール通知（非同期・失敗しても登録は有効）
                const pName = document.getElementById('project-title').textContent || projectId;
                const editUrl = `${window.location.origin}${window.location.pathname.replace('entry.html', '')}edit.html?pid=${projectId}`;
                CIQEmail.sendEntryConfirmation(email, {
                    projectName: pName,
                    entryNumber: String(entryNumber).padStart(3, '0'),
                    password: pw,
                    uuid,
                    familyName,
                    firstName,
                    status: entryStatus,
                    editUrl,
                    senderName: pName + ' 実行委員会',
                    replyTo: globalReplyTo
                }).catch(e => console.warn('メール送信スキップ:', e));

                // 成功画面を表示
                document.getElementById('form-card').style.display = 'none';
                document.getElementById('result-card').style.display = 'block';
                document.getElementById('r-entry-number').textContent = String(entryNumber).padStart(3, '0');
                document.getElementById('status-msg').style.display = 'none';

                // キャンセル待ちの場合の追加メッセージ
                if (entryStatus === 'waitlist') {
                    const waitMsg = document.createElement('div');
                    waitMsg.className = 'status-msg warning';
                    waitMsg.innerHTML = '<i class="fa-solid fa-clock"></i> 定員に達したため、<strong>キャンセル待ち</strong>として登録されました。';
                    waitMsg.style.cssText = 'display:block;margin:12px 0;padding:12px 16px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:8px;color:#fbbf24;font-size:13px;';
                    document.getElementById('r-entry-number').parentElement.after(waitMsg);
                }

            } catch (err) {
                console.error('Entry error:', err);
                btn.disabled = false;
                btn.textContent = 'エントリーを確定する';
                showStatus('エラーが発生しました: ' + err.message, 'error');
            }
        });

        // 初期化: プロジェクト設定読み込み
        async function init() {
            if (!projectId) return;
            await waitForAuth();

            try {
                // プロジェクト名を取得して表示
                let settings = await dbGet(`projects/${projectId}/publicSettings`);
                if (settings) {
                    const pName = settings.projectName || projectId;
                    document.getElementById('project-title').textContent = pName;
                    document.title = pName + ' - エントリーフォーム';
                    
                    globalReplyTo = settings.replyTo || null;

                    // 参加規約リンクにプロジェクトIDを付与
                    const termsLink = document.getElementById('terms-link');
                    if (termsLink) {
                        termsLink.href = `terms.html?pid=${projectId}`;
                    }

                    // エントリー受付チェック
                    let blocked = false;
                    let blockTitle = '';
                    let blockDetail = '';
                    if (settings.entryOpen !== true) {
                        blocked = true;
                        blockTitle = '受付は現在停止中です';
                        blockDetail = '管理者が受付を再開するまでお待ちください。';
                    } else {
                        const now = new Date();
                        const parseLocal = (dtStr) => {
                            if (!dtStr) return null;
                            if (dtStr.includes('T')) {
                                const [d, t] = dtStr.split('T');
                                const [y, m, day] = d.split('-');
                                const [hr, min] = t.split(':');
                                return new Date(y, m - 1, day, hr, min);
                            }
                            return new Date(dtStr);
                        };
                        
                        const startDt = parseLocal(settings.periodStart);
                        const endDt = parseLocal(settings.periodEnd);
                        
                        if (startDt && startDt > now) {
                            blocked = true;
                            blockTitle = 'エントリー受付はまだ開始されていません';
                            blockDetail = '受付開始: ' + startDt.toLocaleString('ja-JP');
                        }
                        if (endDt && endDt < now) {
                            blocked = true;
                            blockTitle = 'エントリー受付は終了しました';
                            blockDetail = '受付終了: ' + endDt.toLocaleString('ja-JP');
                        }
                    }
                    if (blocked) {
                        document.getElementById('form-card').style.display = 'none';
                        document.getElementById('disabled-title').textContent = blockTitle;
                        document.getElementById('disabled-detail').textContent = blockDetail;
                        document.getElementById('disabled-card').style.display = 'block';
                    }
                } else {
                    document.getElementById('form-card').style.display = 'none';
                    document.getElementById('disabled-title').textContent = 'プロジェクトが見つかりません';
                    document.getElementById('disabled-detail').textContent = '正しいエントリーURLへアクセスしてください。';
                    document.getElementById('disabled-card').style.display = 'block';
                }
            } catch (e) {
            }
        }

        init();
