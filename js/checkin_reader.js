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
    const RECENT_MAX = 8;

    const el = (id) => document.getElementById(id);
    const reader = window.CIQQrReaderInput;
    const serial = window.CIQQrSerialReader;

    let processing = false;
    let lastCode = '';
    let lastCodeAt = 0;
    let holdTimer = 0;

    el('reader-back-btn')?.addEventListener('click', () => navigateBack(opsBackTarget()));

    init();

    async function init() {
        try {
            if (!window.CIQSupabaseAPI?.isEnabled?.()) throw new Error('Supabase設定が見つかりません。');
            const sessionData = await CIQSupabaseAPI.getSession();
            if (!sessionData?.user) throw new Error('Googleログインが必要です。');
        } catch (e) {
            showResult('error', 'xmark', '開始できません', { detail: describeError(e, '受付画面を開始できませんでした。') });
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

    async function loadStats() {
        const stats = await CIQSupabaseAPI.getCheckInStats(projectId);
        el('stat-total').textContent = stats.total || 0;
        el('stat-checked').textContent = stats.checked || 0;
        el('stat-remaining').textContent = stats.remaining || 0;
        el('stats-bar').classList.remove('u-hidden');
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
            showResult('error', 'xmark', '受付の二次元コードとして読めません', { detail: '二次元コードを読み直してください。続くときは、リーダーの設定（日本語入力を切る・最後に Enter を付ける）を確認してください。' });
            addRecent('error', '読めません', '');
            return;
        }
        checkIn(code);
    }

    async function checkIn(code) {
        processing = true;
        showLoading();
        try {
            const result = await CIQSupabaseAPI.checkInEntry(projectId, code);
            const entry = result.entry;
            const number = padNum(entry.entryNumber);
            const sub = [entry?.affiliation, entry?.grade].filter(Boolean).join(' / ');
            if (result.result === 'canceled') {
                showResult('canceled', 'xmark', 'キャンセル済み', { detail: sub, number });
                addRecent('danger', 'キャンセル済み', number);
            } else if (result.result === 'waitlist') {
                showResult('already', 'triangle-exclamation', 'キャンセル待ち', { detail: sub, number });
                addRecent('warning', 'キャンセル待ち', number);
            } else if (result.result === 'already') {
                showResult('already', 'triangle-exclamation', '受付済み', { detail: sub, number });
                addRecent('warning', '受付済み', number);
            } else {
                showResult('success', 'check', '受付完了', { detail: sub, number });
                addRecent('success', '受付完了', number);
                loadStats().catch(() => {});
            }
        } catch (err) {
            showResult('error', 'xmark', 'エラーが発生しました', { detail: describeError(err) });
            addRecent('error', 'エラー', '');
        }
        processing = false;
    }

    // ---- 画面 ----
    function showLoading() {
        clearTimeout(holdTimer);
        const box = el('reader-result');
        box.hidden = false;
        box.className = 'reader-result loading';
        box.textContent = '';
        const text = document.createElement('div');
        text.className = 'reader-result-title';
        text.textContent = '確認中…';
        box.appendChild(text);
        el('reader-idle').hidden = true;
    }

    // type: success | already | canceled | error。number は受付番号、detail は所属・学年(エラーのときは説明の文)
    function showResult(type, iconClass, title, { number = '', detail = '' } = {}) {
        clearTimeout(holdTimer);
        const box = el('reader-result');
        box.hidden = false;
        box.className = `reader-result ${type}`;
        box.textContent = '';
        const titleEl = document.createElement('div');
        titleEl.className = 'reader-result-title';
        titleEl.append(createIcon(iconClass), ` ${title}`);
        box.appendChild(titleEl);
        if (number) {
            const label = document.createElement('div');
            label.className = 'reader-result-label';
            label.textContent = '受付番号';
            const num = document.createElement('div');
            num.className = 'reader-result-number';
            num.textContent = number;
            box.append(label, num);
        }
        if (detail) {
            const sub = document.createElement('div');
            sub.className = number ? 'reader-result-sub' : 'reader-result-detail';
            sub.textContent = detail;
            box.appendChild(sub);
        }
        el('reader-idle').hidden = true;
        holdTimer = setTimeout(() => {
            box.hidden = true;
            el('reader-idle').hidden = false;
        }, HOLD_RESULT_MS);
    }

    function addRecent(variant, label, number) {
        const list = el('reader-recent');
        el('reader-recent-empty')?.remove();
        const item = document.createElement('li');
        const time = document.createElement('time');
        const now = new Date();
        time.dateTime = now.toISOString();
        time.textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const num = document.createElement('span');
        num.className = 'reader-recent-number';
        num.textContent = number || '-';
        const badge = document.createElement('span');
        badge.className = `badge ${variant === 'error' ? 'danger' : variant}`;
        badge.textContent = label;
        item.append(time, num, badge);
        list.prepend(item);
        while (list.children.length > RECENT_MAX) list.lastElementChild.remove();
    }

    // ---- 1. キーボード入力 ----
    function startKeyboardInput() {
        const input = el('reader-input');
        const state = el('reader-keyboard-state');
        const idleSub = el('reader-idle-sub');
        let idleTimer = 0;

        const focusInput = () => { if (document.activeElement !== input) input.focus({ preventScroll: true }); };
        const update = () => {
            const active = document.activeElement === input;
            state.textContent = active ? '待機中' : '画面をクリックすると、読み取りを始めます';
            idleSub.textContent = active ? '読み取り待機中' : '画面をクリックすると、読み取りを始めます';
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
        // どこを押しても、入力欄に戻す(ボタンや選択欄を操作したあとも、読み取りが届くように)
        document.addEventListener('click', (event) => {
            if (event.target.closest('select, option')) return;
            focusInput();
        });
        window.addEventListener('focus', focusInput);
        input.addEventListener('focus', update);
        input.addEventListener('blur', () => { update(); setTimeout(() => { if (!document.activeElement?.closest?.('select')) focusInput(); }, 0); });
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
        const port = serial.createSerialReader({
            onCode: handleCode,
            onState: (status, detail) => {
                connected = status === 'connected';
                state.textContent = status === 'connected' ? '接続中'
                    : status === 'error' ? `切れました${detail ? `（${detail}）` : ''}`
                    : '未接続';
                button.textContent = connected ? '切断する' : '接続する';
            },
        });
        const baud = () => Number(baudSelect.value) || 9600;
        button.addEventListener('click', async () => {
            if (connected) { await port.disconnect(); state.textContent = '未接続'; button.textContent = '接続する'; connected = false; return; }
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
}
