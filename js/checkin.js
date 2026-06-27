// checkin.js - QR受付（Supabase）

const projectId = session.projectId;

function makeIcon(className) {
    const icon = document.createElement('i');
    icon.className = className;
    return icon;
}

function setPageTitle(projectName) {
    const title = document.getElementById('page-title');
    if (!title) return;
    title.textContent = '';
    title.append(makeIcon('fa-solid fa-qrcode'), ` ${projectName} 受付`);
}

if (!projectId) {
    document.body.textContent = '';
    const message = document.createElement('div');
    message.style.padding = '40px';
    message.style.textAlign = 'center';
    message.style.color = 'var(--danger)';
    message.style.fontWeight = 'bold';
    message.textContent = 'プロジェクトに入室してください。3秒後にトップページへ戻ります。';
    document.body.appendChild(message);
    setTimeout(() => location.href = 'index.html', 3000);
} else {
    document.getElementById('checkin-back-btn')?.addEventListener('click', () => {
        location.href = 'judge.html';
    });

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
                setPageTitle(project.name);
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
        resultDiv.textContent = '';
        const loading = document.createElement('div');
        loading.textContent = '読み込み中...';
        resultDiv.appendChild(loading);
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
                showResultUI('canceled', 'fa-solid fa-xmark', 'キャンセル済み', name, number);
            } else if (result.result === 'waitlist') {
                showResultUI('already', 'fa-solid fa-triangle-exclamation', 'キャンセル待ち', name, number);
            } else if (result.result === 'already') {
                showResultUI('already', 'fa-solid fa-triangle-exclamation', '受付済み', name, number);
            } else {
                showResultUI('success', 'fa-solid fa-check', '受付完了', name, number);
                await loadStats();
            }
        } catch (err) {
            showResultUI('error', 'fa-solid fa-xmark', 'エラーが発生しました', err.message, '');
            lastUUID = '';
        }
        processing = false;
    }

    function showResultUI(type, iconClass, title, name, number) {
        if (hideTimer) clearTimeout(hideTimer);
        resultDiv.style.display = 'block';
        resultDiv.className = type;
        resultDiv.textContent = '';
        const titleEl = document.createElement('div');
        titleEl.append(makeIcon(iconClass), ` ${title}`);
        resultDiv.appendChild(titleEl);
        if (name) {
            const nameEl = document.createElement('div');
            nameEl.className = 'name';
            nameEl.textContent = name;
            resultDiv.appendChild(nameEl);
        }
        if (number) {
            const numberEl = document.createElement('div');
            numberEl.className = 'number';
            numberEl.textContent = number;
            resultDiv.appendChild(numberEl);
        }
        scanningText.textContent = 'QRコードをカメラにかざしてください';

        hideTimer = setTimeout(() => {
            resultDiv.style.display = 'none';
            lastUUID = '';
        }, 3000);
    }
}
