const projectId = session.projectId;
        const secretHash = session.get("secretHash");
        if (!projectId) { alert('プロジェクトに入室してください'); location.href = 'index.html'; }

        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const resultDiv = document.getElementById('result');
        const scanningText = document.getElementById('scanning-text');
        let processing = false;
        let lastUUID = '';
        let hideTimer = null;

        // プロジェクト名読み込み
        (async function init() {
            const snap = await db.ref(`projects/${projectId}/settings`).once('value');
            if (snap.exists()) {
                const s = snap.val();
                document.getElementById('page-title').textContent = (s.projectName || '') + ' 受付';
            }
            loadStats();
        })();

        async function loadStats() {
            const snap = await db.ref(`projects/${projectId}/entries`).once('value');
            if (!snap.exists()) return;
            let total = 0, checked = 0;
                            const children = [];
                snap.forEach(c => children.push(c.val()));
                for (const v of children) {
                    let pii = v;
                    if (v.encryptedPII) {
                        try {
                            const privJwk = JSON.parse(session.get('privateKeyJwk'));
                            const jsonStr = await AppCrypto.decryptRSA(v.encryptedPII, privJwk);
                            pii = JSON.parse(jsonStr);
                        } catch(e) {}
                    }
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="padding:10px;border-bottom:1px solid #444;">${v.entryNumber}</td>
                        <td style="padding:10px;border-bottom:1px solid #444;">${pii.familyName || '-'} ${pii.firstName || '-'}</td>
                        <td style="padding:10px;border-bottom:1px solid #444;">${pii.affiliation || '-'}</td>
                        <td style="padding:10px;border-bottom:1px solid #444;font-weight:bold;color:${v.checkedIn ? '#4caf50' : '#aaa'}">${v.checkedIn ? '<i class="fa-solid fa-check"></i> 完了' : '未完了'}</td>
                        <td style="padding:10px;border-bottom:1px solid #444;text-align:right;">
                            <button class="btn" style="padding:6px 12px;font-size:14px;${v.checkedIn ? 'background:#444' : ''}" onclick="completeCheckin('${v.uuid}')">${v.checkedIn ? '取消' : '受付完了'}</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                }
            document.getElementById('stat-total').textContent = total;
            document.getElementById('stat-checked').textContent = checked;
            document.getElementById('stat-remaining').textContent = total - checked;
            document.getElementById('stats-bar').style.display = 'block';
        }

        // カメラ起動（リファレンス準拠: 即座に起動）
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => {
                video.srcObject = stream;
                video.play();
                requestAnimationFrame(scanFrame);
            })
            .catch(err => {
                scanningText.textContent = 'カメラの起動に失敗しました: ' + err.message;
            });

        // スキャンループ（リファレンス準拠: 常時スキャン、重複防止付き）
        function scanFrame() {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code && !processing && code.data !== lastUUID) {
                    processing = true;
                    lastUUID = code.data;
                    showLoading();
                    processQR(code.data);
                }
            }
            requestAnimationFrame(scanFrame);
        }

        function showLoading() {
            if (hideTimer) clearTimeout(hideTimer);
            resultDiv.style.display = 'block';
            resultDiv.className = 'loading';
            resultDiv.innerHTML = '<div>⏳ 読み込み中...</div>';
        }

        // Firebase直接参照（リファレンスのGAS方式ではなく、Firebase直接）
        async function processQR(uuid) {
            try {
                const snap = await db.ref(`projects/${projectId}/entries/${uuid}`).once('value');

                if (!snap.exists()) {
                    showResultUI('error', '<i class="fa-solid fa-xmark"></i> 該当者が見つかりません', '', '');
                } else {
                    const data = snap.val();
                    if (data.status === 'canceled') {
                        showResultUI('canceled', '<i class="fa-solid fa-xmark"></i> キャンセル済み', `${data.familyName} ${data.firstName}`, `受付番号 ${data.entryNumber}`);
                    } else if (data.checkedIn) {
                        showResultUI('already', '<i class="fa-solid fa-triangle-exclamation"></i>️ 受付済み', `${data.familyName} ${data.firstName}`, `受付番号 ${data.entryNumber}`);
                    } else {
                        await db.ref(`projects/${projectId}/entries/${uuid}/checkedIn`).set(true);
                        showResultUI('success', '<i class="fa-solid fa-check"></i> 受付完了', `${data.familyName} ${data.firstName}`, `受付番号 ${data.entryNumber}`);
                        loadStats();
                    }
                }
            } catch (err) {
                showResultUI('error', '<i class="fa-solid fa-xmark"></i> エラーが発生しました', err.message, '');
                lastUUID = ''; // エラー時はリトライ可能に
            }
            processing = false;
        }

        function showResultUI(type, title, name, number) {
            if (hideTimer) clearTimeout(hideTimer);
            resultDiv.style.display = 'block';
            resultDiv.className = type;
            resultDiv.innerHTML = `
                <div>${title}</div>
                ${name ? `<div class="name">${name}</div>` : ''}
                ${number ? `<div class="number">${number}</div>` : ''}
            `;
            scanningText.textContent = 'QRコードをカメラにかざしてください';

            // 3秒後に結果を非表示にし、同じQRの再スキャンを許可
            hideTimer = setTimeout(() => {
                resultDiv.style.display = 'none';
                lastUUID = '';
            }, 3000);
        }