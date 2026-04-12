const params = new URLSearchParams(location.search);
        const projectId = params.get('pid');

        if (!projectId) {
            document.getElementById('form-card').style.display = 'none';
            const d = document.getElementById('disabled-card');
            d.innerHTML = '<p>プロジェクトが指定されていません。</p><p style="margin-top:8px;font-size:13px">正しいエントリーURLへアクセスしてください。</p>';
            d.style.display = 'block';
        }

        function generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        function generatePW() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
            let pw = '';
            for (let i = 0; i < 6; i++) {
                pw += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return pw;
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
            btn.disabled = true;
            btn.textContent = '処理中...';
            showStatus('エントリーを送信しています...', 'info');

            const email = document.getElementById('f-email').value.trim();
            const familyName = document.getElementById('f-family-name').value.trim();
            const firstName = document.getElementById('f-first-name').value.trim();
            const familyNameKana = document.getElementById('f-family-kana').value.trim();
            const firstNameKana = document.getElementById('f-first-kana').value.trim();
            const affiliation = document.getElementById('f-affiliation').value.trim();
            const grade = document.getElementById('f-grade').value;
            const entryName = document.getElementById('f-entry-name').value.trim();
            const message = document.getElementById('f-message').value.trim();
            const inquiry = document.getElementById('f-inquiry').value.trim();

            const uuid = generateUUID();
            const pw = generatePW();

            try {
                // トランザクションで受付番号を取得 (公開設定配下)
                const counterRef = db.ref(`projects/${projectId}/publicSettings/lastEntryNumber`);
                const { committed, snapshot } = await counterRef.transaction((currentValue) => {
                    return (currentValue || 0) + 1;
                });

                if (!committed) {
                    throw new Error("受付番号の取得に失敗しました。再度お試しください。");
                }

                const entryNumber = snapshot.val();
                const pwHash = await AppCrypto.hashPassword(pw);

                // 公開鍵を取得してPIIを暗号化
                const pubSnap = await db.ref(`projects/${projectId}/publicSettings/publicKey`).once('value');
                if (!pubSnap.exists()) throw new Error("セキュリティキーが取得できません");
                
                const piiData = { email, familyName, firstName, familyNameKana, firstNameKana, affiliation, grade, entryName, message, inquiry };
                const encryptedPII = await AppCrypto.encryptRSA(JSON.stringify(piiData), pubSnap.val());

                const entryData = {
                    uuid,
                    entryNumber,
                    encryptedPII,
                    disclosurePw: pwHash,
                    status: 'registered',
                    checkedIn: false,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                };

                // DBに保存
                await db.ref(`projects/${projectId}/entries/${uuid}`).set(entryData);

                // GAS APIを呼び出してメール送信
                if (typeof SYSTEM_GAS_URL !== 'undefined' && SYSTEM_GAS_URL.startsWith('http')) {
                    try {
                        const pName = document.getElementById('project-title').textContent;
                        const mailParams = new URLSearchParams({
                            action: 'entryMail',
                            projectName: pName,
                            email,
                            familyName,
                            firstName,
                            entryNumber,
                            pw,
                            uuid
                        });

                        fetch(SYSTEM_GAS_URL + '?' + mailParams.toString())
                            .then(r => r.text())
                            .then(t => {})
                            .catch(e => {});
                    } catch (e) {
                    }
                }

                // 成功画面を表示
                document.getElementById('form-card').style.display = 'none';
                document.getElementById('result-card').style.display = 'block';
                document.getElementById('r-entry-number').textContent = String(entryNumber).padStart(3, '0');
                document.getElementById('r-password').textContent = pw;
                document.getElementById('status-msg').style.display = 'none';

            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'エントリーを確定する';
                showStatus('エラーが発生しました: ' + err.message, 'error');
            }
        });

        // 初期化: プロジェクト設定読み込み
        async function init() {
            if (!projectId) return;

            try {
                // プロジェクト名を取得して表示
                const snap = await db.ref(`projects/${projectId}/publicSettings`).once('value');
                if (snap.exists()) {
                    const settings = snap.val();
                    const pName = settings.projectName || 'エントリーフォーム';
                    document.getElementById('project-title').textContent = pName;
                    document.title = pName + ' - エントリーフォーム';

                    // エントリー受付チェック
                    let blocked = false;
                    let blockTitle = '';
                    let blockDetail = '';
                    if (settings.entryOpen === false) {
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