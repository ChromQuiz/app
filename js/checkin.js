// checkin.js - 二次元コード受付（Supabase）

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
    // 二次元コードが最後に映った時刻。しばらく映らなければ「前回のコード」を忘れる（同じコードを続けて処理しないため）。
    // フレーム数ではなく時間で決める（端末の速さで、忘れるまでの長さが変わらないように）。
    let lastSeenAt = 0;
    let hideTimer = null;
    let cameraStream = null;
    let scanFrameId = 0;
    let cameraStartPromise = null;
    const FORGET_AFTER_MS = 800;

    init();

    async function init() {
        try {
            if (typeof jsQR !== 'function') {
                throw new Error('二次元コード読み取りライブラリを読み込めませんでした。ページを再読み込みしてください。');
            }
            if (!window.CIQSupabaseAPI?.isEnabled?.()) {
                throw new Error('Supabase設定が見つかりません。');
            }
            const sessionData = await CIQSupabaseAPI.getSession();
            if (!sessionData?.user) {
                throw new Error('Googleログインが必要です。');
            }
            await startCamera();

            const project = await CIQSupabaseAPI.getProject(projectId).catch(() => null);
            if (project?.name) {
                setPageTitle(project.name);
            }
            await loadStats().catch((e) => {
                console.warn('Check-in stats failed:', e);
            });
        } catch (e) {
            setScanMessage(describeError(e, '受付画面を開始できませんでした。'));
        }
    }

    // 受付状況(済・未・計)は、参加者に見せない。運営だけが開く設定の中に出す
    async function loadStats() {
        const stats = await CIQSupabaseAPI.getCheckInStats(projectId);
        document.getElementById('checkin-tally').textContent = `済 ${stats.checked || 0}　未 ${stats.remaining || 0}　計 ${stats.total || 0}`;
    }

    // ---- 運営だけが使う設定(右上の歯車) ----
    const settings = document.getElementById('checkin-settings');
    document.getElementById('checkin-settings-btn').addEventListener('click', () => {
        settings.showModal();
        loadStats().catch(() => {});
    });
    document.getElementById('checkin-settings-close').addEventListener('click', () => settings.close());
    document.getElementById('checkin-camera-restart').addEventListener('click', async () => {
        stopCamera();
        await startCamera();
    });

    async function startCamera() {
        if (cameraStartPromise) return cameraStartPromise;
        if (cameraStream && video.srcObject === cameraStream) {
            await video.play().catch(() => {});
            if (!scanFrameId) scanFrameId = requestAnimationFrame(scanFrame);
            return;
        }
        if (!window.isSecureContext) {
            setScanMessage('カメラはHTTPSまたはlocalhostでのみ使用できます。公開URLから開いてください。');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setScanMessage('このブラウザではカメラを使用できません。');
            return;
        }

        setScanMessage('カメラを起動しています…');
        cameraStartPromise = (async () => {
            stopCamera();
            // 解像度を指定しないと端末によっては 640×480 程度になり、細かい二次元コードがつぶれる。
            // ideal は「できれば」の指定なので、対応しない端末でも失敗せず使える範囲で動く。
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });
            await attachCameraStream(stream);
        })();
        try {
            await cameraStartPromise;
        } catch (err) {
            if (err.name === 'OverconstrainedError') {
                await retryAnyCamera();
                return;
            }
            setScanMessage(cameraErrorMessage(err));
        } finally {
            cameraStartPromise = null;
        }
    }

    async function retryAnyCamera() {
        try {
            stopCamera();
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            await attachCameraStream(stream);
        } catch (err) {
            setScanMessage(cameraErrorMessage(err));
        }
    }

    async function attachCameraStream(stream) {
        cameraStream = stream;
        setCameraState('使用中');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.srcObject = stream;
        await waitForVideoReady();
        await video.play();
        await waitForVideoReady();
        scanningText.textContent = '';
        scanningText.append(makeIcon('camera'), ' 二次元コードをカメラにかざしてください');
        scanFrameId = requestAnimationFrame(scanFrame);
    }

    function waitForVideoReady() {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let done = false;
            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onReady);
                video.removeEventListener('canplay', onReady);
            };
            const onReady = () => {
                if (done) return;
                if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
                done = true;
                cleanup();
                resolve();
            };
            video.addEventListener('loadedmetadata', onReady);
            video.addEventListener('canplay', onReady);
            window.setTimeout(() => {
                if (done) return;
                done = true;
                cleanup();
                resolve();
            }, 1200);
        });
    }

    function stopCamera() {
        cameraStartPromise = null;
        if (scanFrameId) cancelAnimationFrame(scanFrameId);
        scanFrameId = 0;
        cameraStream?.getTracks?.().forEach((track) => track.stop());
        cameraStream = null;
        setCameraState('停止中');
        if (video.srcObject) video.srcObject = null;
    }

    function cameraErrorMessage(err) {
        if (err?.name === 'NotAllowedError') return 'カメラの使用が許可されていません。ブラウザのサイト設定でカメラを許可してください。';
        if (err?.name === 'NotFoundError') return '利用できるカメラが見つかりません。';
        if (err?.name === 'NotReadableError') return 'カメラを開始できません。他のアプリが使用している可能性があります。';
        return `カメラを起動できませんでした。（詳細：${errorDetail(err)}）`;
    }

    function setCameraState(text) {
        const state = document.getElementById('checkin-camera-state');
        if (state) state.textContent = text;
    }

    function setScanMessage(message) {
        setCameraState(message);
        scanningText.textContent = '';
        scanningText.append(makeIcon('triangle-exclamation'), ` ${message}`);
    }

    function scanFrame() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // 反転(白黒逆)の二次元コードは使わない。既定の attemptBoth は毎フレーム2回走査して遅い。
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            const qrData = code?.data?.trim();
            const now = performance.now();
            if (qrData) {
                lastSeenAt = now;
            } else if (lastUUID && now - lastSeenAt > FORGET_AFTER_MS) {
                lastUUID = '';
            }
            if (qrData && !processing && qrData !== lastUUID) {
                processing = true;
                lastUUID = qrData;
                showLoading();
                processQR(qrData);
            }
        }
        scanFrameId = requestAnimationFrame(scanFrame);
    }

    window.addEventListener('pagehide', stopCamera);
    window.addEventListener('pageshow', () => {
        if (document.visibilityState !== 'hidden') startCamera();
    });
    document.addEventListener('visibilitychange', () => {
        // 画面を隠したら（別のアプリ・タブに移ったら）カメラを止める。戻ったら再開する。
        if (document.visibilityState === 'visible') startCamera();
        else stopCamera();
    });

    const resultView = window.CIQCheckinResultView;

    function showLoading() {
        if (hideTimer) clearTimeout(hideTimer);
        resultView.render(resultDiv, { state: 'loading' });
    }

    async function processQR(qrValue) {
        return runCheckIn(() => CIQSupabaseAPI.checkInEntry(projectId, qrValue));
    }

    async function runCheckIn(invoke) {
        try {
            const view = resultView.describeCheckIn(await invoke());
            showResultUI(view);
            if (view.state === 'success') await loadStats();
        } catch (err) {
            // 前回のコードは忘れない。エラーのコード（他の大会のもの・期限切れなど）が映ったままだと、
            // 毎フレームサーバーに問い合わせ続け、「見つからない」の回数制限（会場の同じ回線で共有）に達して、全端末の受付が止まる。
            // コードが画面から外れたら（scanFrame）、次のコードを受け付ける。
            showResultUI({ state: 'error', detail: describeError(err) });
        }
        processing = false;
    }

    function showResultUI(view) {
        if (hideTimer) clearTimeout(hideTimer);
        resultView.render(resultDiv, view);
        scanningText.textContent = '二次元コードをカメラにかざしてください';
        hideTimer = setTimeout(() => resultView.hide(resultDiv), 3000);
    }
}
