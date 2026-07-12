// checkin.js - QR受付（Supabase）

const auth = requireAuth();
const { projectId } = auth || {};

function makeIcon(className) {
    const icon = createIcon(className);
    return icon;
}

function setPageTitle(projectName) {
    const title = document.getElementById('page-title');
    if (!title) return;
    title.textContent = '';
    title.append(makeIcon('qrcode'), ` ${projectName} 受付`);
}

if (auth) {
    const backBtn = document.getElementById('checkin-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            navigateBack(opsBackTarget());
        });
    }

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
            if (typeof jsQR !== 'function') {
                throw new Error('QR読み取りライブラリを読み込めませんでした。ページを再読み込みしてください。');
            }
            if (!window.CIQSupabaseAPI?.isEnabled?.()) {
                throw new Error('Supabase設定が見つかりません。');
            }
            const sessionData = await CIQSupabaseAPI.getSession();
            if (!sessionData?.user) {
                throw new Error('Googleログインが必要です。');
            }
            startCamera();

            const project = await CIQSupabaseAPI.getProject(projectId).catch(() => null);
            if (project?.name) {
                setPageTitle(project.name);
            }
            await loadStats().catch((e) => {
                console.warn('Check-in stats failed:', e);
            });
        } catch (e) {
            setScanMessage(e.message || '受付画面を開始できませんでした。');
        }
    }

    async function loadStats() {
        const stats = await CIQSupabaseAPI.getCheckInStats(projectId);
        document.getElementById('stat-total').textContent = stats.total || 0;
        document.getElementById('stat-checked').textContent = stats.checked || 0;
        document.getElementById('stat-remaining').textContent = stats.remaining || 0;
        document.getElementById('stats-bar').classList.remove('u-hidden');
    }

    function startCamera() {
        if (!window.isSecureContext) {
            setScanMessage('カメラはHTTPSまたはlocalhostでのみ使用できます。公開URLから開いてください。');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setScanMessage('このブラウザではカメラを使用できません。');
            return;
        }

        setScanMessage('カメラを起動しています...');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
            .then(stream => {
                video.srcObject = stream;
                video.muted = true;
                video.playsInline = true;
                return video.play();
            })
            .then(() => {
                scanningText.textContent = '';
                scanningText.append(makeIcon('camera'), ' QRコードをカメラにかざしてください');
                requestAnimationFrame(scanFrame);
            })
            .catch(err => {
                if (err.name === 'OverconstrainedError') {
                    retryAnyCamera();
                    return;
                }
                setScanMessage(cameraErrorMessage(err));
            });
    }

    function retryAnyCamera() {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            .then(stream => {
                video.srcObject = stream;
                video.muted = true;
                video.playsInline = true;
                return video.play();
            })
            .then(() => {
                scanningText.textContent = '';
                scanningText.append(makeIcon('camera'), ' QRコードをカメラにかざしてください');
                requestAnimationFrame(scanFrame);
            })
            .catch(err => setScanMessage(cameraErrorMessage(err)));
    }

    function cameraErrorMessage(err) {
        if (err?.name === 'NotAllowedError') return 'カメラの使用が許可されていません。ブラウザのサイト設定でカメラを許可してください。';
        if (err?.name === 'NotFoundError') return '利用できるカメラが見つかりません。';
        if (err?.name === 'NotReadableError') return 'カメラを開始できません。他のアプリが使用している可能性があります。';
        return `カメラの起動に失敗しました: ${err?.message || err}`;
    }

    function setScanMessage(message) {
        scanningText.textContent = '';
        scanningText.append(makeIcon('triangle-exclamation'), ` ${message}`);
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
        resultDiv.className = 'is-visible loading';
        resultDiv.textContent = '';
        const loading = document.createElement('div');
        loading.textContent = '読み込み中...';
        resultDiv.appendChild(loading);
    }

    function entryLabel(entry) {
        return `受付番号 ${padNum(entry?.entryNumber || '')}`;
    }

    async function processQR(entryId) {
        try {
            const result = await CIQSupabaseAPI.checkInEntry(projectId, entryId);
            const entry = result.entry;
            const name = entryLabel(entry);
            const number = `受付番号 ${padNum(entry.entryNumber)}`;

            if (result.result === 'canceled') {
                showResultUI('canceled', 'xmark', 'キャンセル済み', name, number);
            } else if (result.result === 'waitlist') {
                showResultUI('already', 'triangle-exclamation', 'キャンセル待ち', name, number);
            } else if (result.result === 'already') {
                showResultUI('already', 'triangle-exclamation', '受付済み', name, number);
            } else {
                showResultUI('success', 'check', '受付完了', name, number);
                await loadStats();
            }
        } catch (err) {
            showResultUI('error', 'xmark', 'エラーが発生しました', err.message, '');
            lastUUID = '';
        }
        processing = false;
    }

    function showResultUI(type, iconClass, title, name, number) {
        if (hideTimer) clearTimeout(hideTimer);
        resultDiv.className = `is-visible ${type}`;
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
            resultDiv.classList.remove('is-visible');
            lastUUID = '';
        }, 3000);
    }
}
