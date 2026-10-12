// checkin_reader.js — 二次元コードリーダー専用の当日受付（Supabase）
//
// カメラは使わない。読み取りは、2つの経路から、同じ受付の処理へ入る。
//   1. キーボード入力: リーダーが、キーボードのように文字を打ち込む(見えない入力欄で受ける)
//   2. USBシリアル(Web Serial): Chrome・Edge でだけ
// 受付は、署名付きの二次元コードを検証するサーバーの処理(check-in)だけを使う。受付番号で受付する経路は、ない。

const auth = requireAuth();
const { projectId } = auth || {};

if (auth) {
    const HOLD_RESULT_MS = 6000;        // 結果を出しておく時間(次の読み取りで、すぐ入れ替わる)
    const REPEAT_BLOCK_MS = 3000;       // 同じコードを続けて受け付けない時間(かざしたままの二重読み取り)
    const IDLE_SUBMIT_MS = 250;         // 最後に Enter が付かないリーダー向け: 入力が止まって、この時間で1回の読み取りにする

    const el = (id) => document.getElementById(id);
    const reader = window.CIQQrReaderInput;
    const serial = window.CIQQrSerialReader;

    let processing = false;
    let lastCode = '';
    let lastCodeAt = 0;
    let holdTimer = 0;

    el('reader-back-btn')?.addEventListener('click', () => navigateBack(opsBackTarget()));

    async function init() {
        try {
            if (!window.CIQSupabaseAPI?.isEnabled?.()) throw new Error('Supabase設定が見つかりません。');
            const sessionData = await CIQSupabaseAPI.getSession();
            if (!sessionData?.user) throw new Error('Googleログインが必要です。');
        } catch (e) {
            showResult({ state: 'error', title: '開始できません', detail: describeError(e, '受付画面を開始できませんでした。') });
            return;
        }
        startKeyboardInput();
        setupSerial();
        const project = await CIQSupabaseAPI.getProject(projectId).catch(() => null);
        if (project?.name) setPageTitle(project.name);
        await loadStats().catch((e) => console.warn('Check-in stats failed:', e));
    }

    function setPageTitle(projectName) {
        const title = el('page-title');
        title.textContent = '';
        title.append(createIcon('qrcode'), ` ${projectName} 受付`);
    }

    // 受付状況(済・未・計)は、参加者に見せない。運営だけが開く設定の中に出す
    async function loadStats() {
        const stats = await CIQSupabaseAPI.getCheckInStats(projectId);
        el('reader-tally').textContent = `済 ${stats.checked || 0}　未 ${stats.remaining || 0}　計 ${stats.total || 0}`;
    }

    // ---- 読み取りの入口(2つの経路が、ここへ来る) ----
    function handleCode(raw) {
        const code = reader.normalizeReaderCode(raw);
        if (!code || processing) return;
        const now = performance.now();
        if (code === lastCode && now - lastCodeAt < REPEAT_BLOCK_MS) return;
        lastCode = code;
        lastCodeAt = now;
        if (!reader.looksLikeCheckInCode(code)) {
            // 読み間違い(日本語入力・リーダーの設定)は、サーバーに送らない(「見つからない」の回数制限を使い切らないため)
            showResult({ state: 'error', title: '受付の二次元コードとして読めません', detail: '二次元コードを読み直してください。続くときは、リーダーの設定（日本語入力を切る・最後に Enter を付ける）を確認してください。' });
            return;
        }
        checkIn(code);
    }

    const resultView = window.CIQCheckinResultView;

    async function checkIn(code) {
        processing = true;
        showLoading();
        try {
            const view = resultView.describeCheckIn(await CIQSupabaseAPI.checkInEntry(projectId, code));
            showResult(view);
            if (view.state === 'success') loadStats().catch(() => {});
        } catch (err) {
            showResult({ state: 'error', detail: describeError(err) });
        }
        processing = false;
    }

    // ---- 画面(結果の見た目は、カメラの受付画面と同じ部品: checkin_result_view.js) ----
    function showLoading() {
        clearTimeout(holdTimer);
        resultView.render(el('reader-result'), { state: 'loading' });
        el('reader-idle').hidden = true;
    }

    function showResult(view) {
        clearTimeout(holdTimer);
        resultView.render(el('reader-result'), view);
        el('reader-idle').hidden = true;
        holdTimer = setTimeout(() => {
            resultView.hide(el('reader-result'));
            el('reader-idle').hidden = false;
        }, HOLD_RESULT_MS);
    }

    // ---- 画面に出す警告(読み取りが届かないときだけ) ----
    const warnings = { keyboard: '', serial: '' };
    function setIdleWarning(text, source = 'keyboard') {
        warnings[source] = text;
        const box = el('reader-idle-warn');
        const message = warnings.serial || warnings.keyboard;
        box.textContent = message;
        box.hidden = !message;
    }

    // ---- 運営だけが使う、リーダーの設定(右上) ----
    const settings = el('reader-settings');
    const settingsOpen = () => settings.open;
    el('reader-settings-btn').addEventListener('click', () => {
        settings.showModal();
        loadStats().catch(() => {});
    });
    el('reader-settings-close').addEventListener('click', () => settings.close());
    settings.addEventListener('close', () => el('reader-input').focus({ preventScroll: true }));

    // ---- 1. キーボード入力 ----
    function startKeyboardInput() {
        const input = el('reader-input');
        const state = el('reader-keyboard-state');
        let idleTimer = 0;

        const focusInput = () => { if (!settingsOpen() && document.activeElement !== input) input.focus({ preventScroll: true }); };
        const update = () => {
            const active = document.activeElement === input;
            state.textContent = active ? '待機中' : '画面をクリックすると、読み取りを始めます';
            // 読み取りが届かない状態のときだけ、画面にも出す(普段は、何も出さない)
            setIdleWarning(active || settingsOpen() ? '' : '画面をクリックすると、読み取りを始めます');
        };
        const submit = () => {
            clearTimeout(idleTimer);
            const value = input.value;
            input.value = '';
            handleCode(value);
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                submit();
            }
        });
        input.addEventListener('input', () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(submit, IDLE_SUBMIT_MS);
        });
        // どこを押しても、入力欄に戻す(設定を開いているあいだは、戻さない)
        document.addEventListener('click', focusInput);
        window.addEventListener('focus', focusInput);
        input.addEventListener('focus', update);
        input.addEventListener('blur', () => { setTimeout(() => { update(); focusInput(); }, 0); });
        focusInput();
        update();
    }

    // ---- 2. USBシリアル ----
    function setupSerial() {
        const button = el('reader-serial-btn');
        const state = el('reader-serial-state');
        const note = el('reader-serial-note');
        const baudSelect = el('reader-baud');
        if (!serial.isSupported()) {
            state.textContent = 'このブラウザでは使えません';
            button.disabled = true;
            baudSelect.disabled = true;
            note.hidden = false;
            return;
        }
        let connected = false;
        let wasConnected = false;
        const port = serial.createSerialReader({
            onCode: handleCode,
            onState: (status, detail) => {
                connected = status === 'connected';
                state.textContent = status === 'connected' ? '接続中'
                    : status === 'error' ? `切れました${detail ? `（${detail}）` : ''}`
                    : '未接続';
                button.textContent = connected ? '切断する' : '接続する';
                // つないでいたリーダーが切れたときだけ、画面にも出す
                setIdleWarning(status === 'connected' || !wasConnected ? '' : 'リーダーが切れました。右上の設定で、つなぎ直してください。', 'serial');
                if (connected) wasConnected = true;
            },
        });
        const baud = () => Number(baudSelect.value) || 9600;
        button.addEventListener('click', async () => {
            if (connected) {
                wasConnected = false;
                await port.disconnect();
                state.textContent = '未接続';
                button.textContent = '接続する';
                connected = false;
                setIdleWarning('', 'serial');
                return;
            }
            try {
                await port.connect(baud());
            } catch (error) {
                // 画面でポートを選ばずに閉じた(NotFoundError)ときは、何も言わない
                if (error?.name !== 'NotFoundError') state.textContent = `接続できません（${error?.message || ''}）`;
            }
        });
        // 前に許可したポートがあれば、自動でつなぐ(受付卓の端末を開き直したとき)
        port.reconnect(baud()).catch(() => {});
    }

    init();
}
