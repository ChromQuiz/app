// checkin.js - QR受付（Supabase）

const projectId = session.projectId;
if (!projectId) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--danger);font-weight:bold;">プロジェクトに入室してください。3秒後にトップページへ戻ります。</div>';
    setTimeout(() => location.href = 'index.html', 3000);
} else {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const resultDiv = document.getElementById('result');
    const scanningText = document.getElementById('scanning-text');
    let processing = false;
    let lastUUID = '';
    let hideTimer = null;

    init();

    async function init() {
        try {
            if (!window.CIQSupabaseAPI?.isEnabled?.()) {
                throw new Error('Supabase設定が見つかりません。');
            }
            const sessionData = await CIQSupabaseAPI.getSession();
            if (!sessionData?.user) {
                throw new Error('Googleログインが必要です。');
            }
            const project = await CIQSupabaseAPI.getProject(projectId);
            if (project?.name) {
                document.getElementById('page-title').innerHTML = `<i class="fa-solid fa-qrcode"></i> ${escapeHtml(project.name)} 受付`;
            }
            await loadStats();
            startCamera();
        } catch (e) {
            scanningText.textContent = e.message || '受付画面を開始できませんでした。';
        }
    }

    async function loadStats() {
        const stats = await CIQSupabaseAPI.getCheckInStats(projectId);
        document.getElementById('stat-total').textContent = stats.total || 0;
        document.getElementById('stat-checked').textContent = stats.checked || 0;
        document.getElementById('stat-remaining').textContent = stats.remaining || 0;
        document.getElementById('stats-bar').style.display = 'block';
    }

    function startCamera() {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                video.srcObject = stream;
                video.play();
                requestAnimationFrame(scanFrame);
            })
            .catch(err => {
                scanningText.textContent = 'カメラの起動に失敗しました: ' + err.message;
            });
    }

    function scanFrame() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            const qrData = code?.data?.trim();
            if (qrData && !processing && qrData !== lastUUID) {
                processing = true;
                lastUUID = qrData;
                showLoading();
                processQR(qrData);
            }
        }
        requestAnimationFrame(scanFrame);
    }

    function showLoading() {
        if (hideTimer) clearTimeout(hideTimer);
        resultDiv.style.display = 'block';
        resultDiv.className = 'loading';
        resultDiv.innerHTML = '<div>読み込み中...</div>';
    }

    function entryLabel(entry) {
        return entry?.entryName || `受付番号 ${padNum(entry?.entryNumber || '')}`;
    }

    async function processQR(entryId) {
        try {
            const result = await CIQSupabaseAPI.checkInEntry(projectId, entryId);
            const entry = result.entry;
            const name = entryLabel(entry);
            const number = `受付番号 ${padNum(entry.entryNumber)}`;

            if (result.result === 'canceled') {
                showResultUI('canceled', '<i class="fa-solid fa-xmark"></i> キャンセル済み', name, number);
            } else if (result.result === 'waitlist') {
                showResultUI('already', '<i class="fa-solid fa-triangle-exclamation"></i> キャンセル待ち', name, number);
            } else if (result.result === 'already') {
                showResultUI('already', '<i class="fa-solid fa-triangle-exclamation"></i> 受付済み', name, number);
            } else {
                showResultUI('success', '<i class="fa-solid fa-check"></i> 受付完了', name, number);
                await loadStats();
            }
        } catch (err) {
            showResultUI('error', '<i class="fa-solid fa-xmark"></i> エラーが発生しました', err.message, '');
            lastUUID = '';
        }
        processing = false;
    }

    function showResultUI(type, title, name, number) {
        if (hideTimer) clearTimeout(hideTimer);
        resultDiv.style.display = 'block';
        resultDiv.className = type;
        resultDiv.innerHTML = `
            <div>${title}</div>
            ${name ? `<div class="name">${escapeHtml(name)}</div>` : ''}
            ${number ? `<div class="number">${escapeHtml(number)}</div>` : ''}
        `;
        scanningText.textContent = 'QRコードをカメラにかざしてください';

        hideTimer = setTimeout(() => {
            resultDiv.style.display = 'none';
            lastUUID = '';
        }, 3000);
    }
}
