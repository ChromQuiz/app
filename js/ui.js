/**
 * CIQ 共通 UI ユーティリティ (ui.js)
 * db.js の後に読み込むこと。
 * 注意: createIcon は js/icons.js で定義される local SVG アイコン生成関数。
 *       旧 FA class 文字列（例: 'fa-solid fa-check'）も互換のため icon name に変換する。
 */

function padNum(n) { return String(n).padStart(3, '0'); }

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// FA class 文字列 → icon name の互換マッピング（旧コード資産保護）
const FA_NAME_MAP = {
  'fa-arrow-left': 'arrow-left', 'fa-arrow-right': 'arrow-right',
  'fa-arrow-right-to-bracket': 'arrow-right-to-bracket',
  'fa-arrow-up-right-from-square': 'share-from-square',
  'fa-arrows-rotate': 'arrows-rotate',
  'fa-address-book': 'address-book',
  'fa-ban': 'ban', 'fa-book-open': 'book-open', 'fa-box-open': 'box-open',
  'fa-calendar': 'calendar', 'fa-calendar-days': 'calendar-days',
  'fa-camera': 'camera', 'fa-chart-bar': 'chart-bar',
  'fa-chart-column': 'chart-column', 'fa-chart-pie': 'chart-pie',
  'fa-check': 'check', 'fa-check-circle': 'check-circle',
  'fa-check-double': 'check-double',
  'fa-circle-check': 'circle-check', 'fa-circle-exclamation': 'circle-exclamation',
  'fa-circle-info': 'circle-info', 'fa-circle-notch': 'circle-notch',
  'fa-circle-plus': 'circle-plus', 'fa-circle-question': 'circle-question',
  'fa-circle-xmark': 'circle-xmark', 'fa-clock': 'clock',
  'fa-clock-rotate-left': 'clock-rotate-left', 'fa-cloud-arrow-up': 'cloud-arrow-up',
  'fa-comment': 'comment', 'fa-copy': 'copy', 'fa-crown': 'crown',
  'fa-door-closed': 'door-closed', 'fa-door-open': 'door-open',
  'fa-download': 'download', 'fa-envelope': 'envelope',
  'fa-envelope-circle-check': 'envelope-circle-check',
  'fa-envelope-circle-xmark': 'envelope-circle-xmark',
  'fa-file-csv': 'file-csv', 'fa-file-image': 'file-image',
  'fa-file-lines': 'file-lines', 'fa-file-pdf': 'file-pdf',
  'fa-file-pen': 'file-pen', 'fa-file-export': 'file-export',
  'fa-fingerprint': 'fingerprint', 'fa-flag-checkered': 'flag-checkered',
  'fa-floppy-disk': 'floppy-disk', 'fa-folder-open': 'folder-open',
  'fa-gauge': 'gauge', 'fa-gear': 'gear', 'fa-ghost': 'ghost',
  'fa-graduation-cap': 'graduation-cap', 'fa-hashtag': 'hashtag',
  'fa-history': 'history', 'fa-home': 'home', 'fa-hourglass': 'hourglass',
  'fa-id-badge': 'id-badge', 'fa-inbox': 'inbox',
  'fa-key': 'key', 'fa-keyboard': 'keyboard', 'fa-list': 'list',
  'fa-list-check': 'list-check', 'fa-list-ol': 'list-ol',
  'fa-lock': 'lock', 'fa-magnifying-glass-chart': 'magnifying-glass-chart',
  'fa-map-location-dot': 'map-location-dot', 'fa-map-pin': 'map-pin',
  'fa-message': 'message', 'fa-minus': 'minus', 'fa-paper-plane': 'paper-plane',
  'fa-paperclip': 'paperclip', 'fa-pen': 'pen', 'fa-pen-to-square': 'pen-to-square',
  'fa-percent': 'percent', 'fa-play': 'play', 'fa-plus': 'plus',
  'fa-qrcode': 'qrcode', 'fa-ranking-star': 'ranking-star',
  'fa-right-from-bracket': 'right-from-bracket',
  'fa-right-to-bracket': 'right-to-bracket',
  'fa-rotate': 'rotate', 'fa-rotate-left': 'rotate-left',
  'fa-rotate-right': 'rotate-right',
  'fa-school': 'school', 'fa-scroll': 'scroll',
  'fa-send': 'send', 'fa-share-from-square': 'share-from-square',
  'fa-shield-halved': 'shield-halved', 'fa-sliders': 'sliders',
  'fa-spinner': 'spinner', 'fa-spell-check': 'spell-check',
  'fa-stop': 'stop', 'fa-table-cells-large': 'table-cells-large',
  'fa-th': 'th', 'fa-tower-broadcast': 'tower-broadcast',
  'fa-trash': 'trash', 'fa-trophy': 'trophy',
  'fa-triangle-exclamation': 'triangle-exclamation',
  'fa-unlock': 'unlock', 'fa-user': 'user', 'fa-user-check': 'user-check',
  'fa-user-clock': 'user-clock', 'fa-user-plus': 'user-plus',
  'fa-user-shield': 'user-shield', 'fa-user-slash': 'user-slash',
  'fa-user-xmark': 'user-xmark', 'fa-users': 'users',
  'fa-users-gear': 'users-gear', 'fa-wifi': 'wifi', 'fa-wrench': 'wrench',
  'fa-xmark': 'xmark',
};

/**
 * 旧 createIcon(className) 互換ブリッジ。
 * 'fa-solid fa-check' 形式 → 'check' に変換して SVG アイコンを返す。
 * 'check' 形式はそのまま icons.js の createIcon へ委譲。
 * icons.js 未読み込み時は i 要素フォールバック（後方互換）。
 */
function createIconLegacyBridge(nameOrClass, opts) {
  // icons.js が読み込まれていればそちらの createIcon を使用
  if (typeof window.__createSvgIcon === 'function') {
    return window.__createSvgIcon(nameOrClass, opts);
  }
  const icon = createIcon(nameOrClass);
  return icon;
}
window.createIcon = createIconLegacyBridge;

function logout() {
    session.clear();
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('masterData_')) localStorage.removeItem(k);
    });
    location.href = 'index.html';
}

function getMasterData(projectId) {
    try {
        return JSON.parse(localStorage.getItem(`masterData_${projectId}`) || '{}');
    } catch (e) {
        return {};
    }
}

async function showPreview(projectId, secretHash, entryNum) {
    let overlay = document.getElementById('preview-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'preview-overlay';
        overlay.className = 'preview-overlay';
        document.body.appendChild(overlay);
    }
    const masterData = getMasterData(projectId);
    const name = masterData[entryNum]?.name || `受付番号 ${entryNum}`;

    overlay.textContent = '';
    const header = document.createElement('div');
    header.className = 'preview-header';
    const title = document.createElement('h2');
    title.append(createIcon('fa-solid fa-file-image'), ` ${name} の解答用紙`);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'preview-close';
    closeBtn.textContent = '✕ 閉じる';
    closeBtn.addEventListener('click', () => { overlay.classList.remove('show'); });
    header.append(title, closeBtn);

    const pc = document.createElement('div');
    pc.id = 'preview-content';
    pc.className = 'preview-overlay-content';
    const loading = document.createElement('div');
    loading.className = 'text-muted-loader';
    loading.append(createIcon('fa-solid fa-spinner fa-spin'), ' 読み込み中...');
    pc.appendChild(loading);
    overlay.append(header, pc);

    overlay.classList.add('show');

    try {
        const page = await CIQSupabaseAPI.getAnswerPageByEntryNumber(projectId, entryNum);
        if (page?.storage_path) {
            const signedUrl = await CIQSupabaseAPI.getAnswerPageUrl(page.storage_path);
            pc.textContent = '';
            const image = document.createElement('img');
            image.src = signedUrl;
            image.alt = name;
            image.className = 'preview-image';
            pc.appendChild(image);
        } else {
            setPreviewMessage(pc, 'ページ画像が保存されていません。管理画面から答案を再読み込みしてください。');
        }
    } catch (e) {
        setPreviewMessage(pc, `ページ画像を読み込めませんでした: ${e.message}`);
    }
}

function setPreviewMessage(container, message) {
    container.textContent = '';
    const el = document.createElement('div');
    el.className = 'text-muted-center';
    el.textContent = message;
    container.appendChild(el);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const o = document.getElementById('preview-overlay');
        if (o) o.classList.remove('show');
        const panel = document.getElementById('menu-panel');
        if (panel && panel.classList.contains('active')) toggleMenu();
    }
});

function toggleMenu() {
    const panel = document.getElementById('menu-panel');
    const backdrop = document.getElementById('menu-backdrop');
    if (!panel || !backdrop) return;
    const isOpen = panel.classList.contains('active');
    panel.classList.toggle('active', !isOpen);
    backdrop.classList.toggle('active', !isOpen);
    document.body.classList.toggle('body-scroll-locked', !isOpen);
}

function requireAuth(opts = {}) {
    const projectId = session.projectId;
    const secretHash = session.get('secretHash');
    const scorerName = session.scorerName;
    const scorerRole = session.scorerRole;
    const supabaseMode = session.get('supabaseMode') === 'true';

    if (!projectId || !scorerName) {
        location.href = 'index.html';
        return null;
    }
    if (opts.requireAdmin && scorerRole !== 'admin') {
        document.body.textContent = '';
        const message = document.createElement('div');
        message.className = 'auth-redirect';
        message.textContent = '管理者としてプロジェクトに入室してください。3秒後にトップページへ戻ります。';
        document.body.appendChild(message);
        setTimeout(() => location.href = 'index.html', 3000);
        return null;
    }
    if (!supabaseMode && typeof watchProjectDeletion === 'function') watchProjectDeletion(projectId);
    return { projectId, secretHash, scorerName, scorerRole, supabaseMode };
}

function showToast(msg, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const icon = createIcon(`fa-solid ${icons[type] || icons.info}`);
    const text = document.createElement('span');
    text.textContent = String(msg || '');
    toast.append(icon, text);
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

function showConfirm(message, confirmText = '削除する') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog glass-panel';
        const icon = createIcon('fa-solid fa-triangle-exclamation confirm-icon');
        const messageEl = document.createElement('div');
        messageEl.className = 'confirm-message';
        messageEl.textContent = String(message || '');
        const actions = document.createElement('div');
        actions.className = 'confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn secondary confirm-cancel';
        cancelBtn.textContent = 'キャンセル';
        const okBtn = document.createElement('button');
        okBtn.className = 'btn danger confirm-ok';
        okBtn.textContent = String(confirmText || '削除する');
        actions.append(cancelBtn, okBtn);
        dialog.append(icon, messageEl, actions);
        overlay.appendChild(dialog);

        cancelBtn.onclick = () => { overlay.remove(); resolve(false); };
        okBtn.onclick = () => { overlay.remove(); resolve(true); };
        overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        document.body.appendChild(overlay);
        okBtn.focus();
    });
}

const ConnectionMonitor = {
    _offlineBanner: null,
    _onlineBanner: null,
    _wasOffline: false,

    init() {
        this._offlineBanner = document.createElement('div');
        this._offlineBanner.className = 'offline-banner';
        this._offlineBanner.append(createIcon('fa-solid fa-wifi'), ' インターネット接続が切断されました');
        document.body.appendChild(this._offlineBanner);

        this._onlineBanner = document.createElement('div');
        this._onlineBanner.className = 'online-banner';
        this._onlineBanner.append(createIcon('fa-solid fa-check-circle'), ' 接続が回復しました');
        document.body.appendChild(this._onlineBanner);

        window.addEventListener('offline', () => this._goOffline());
        window.addEventListener('online', () => this._goOnline());

        if (!navigator.onLine) this._goOffline();
    },

    _goOffline() {
        this._wasOffline = true;
        this._offlineBanner.classList.add('visible');
        this._onlineBanner.classList.remove('visible');
    },

    _goOnline() {
        this._offlineBanner.classList.remove('visible');
        if (this._wasOffline) {
            this._onlineBanner.classList.add('visible');
            setTimeout(() => this._onlineBanner.classList.remove('visible'), 3000);
        }
    }
};

const KeyboardShortcuts = {
    _shortcuts: [],
    _modalEl: null,

    register(key, description, handler, opts = {}) {
        this._shortcuts.push({ key, description, handler, ...opts });
    },

    init() {
        this.register('?', 'ショートカット一覧を表示', () => this.toggleHelp(), { shift: true });
        this.register('Escape', 'モーダルを閉じる', () => this._closeHelp());

        document.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

            for (const s of this._shortcuts) {
                const keyMatch = e.key === s.key || e.key.toLowerCase() === s.key.toLowerCase();
                const ctrlMatch = !s.ctrl || (e.ctrlKey || e.metaKey);
                const shiftMatch = !s.shift || e.shiftKey;
                const altMatch = !s.alt || e.altKey;
                if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
                    e.preventDefault();
                    s.handler();
                    return;
                }
            }
        });
    },

    toggleHelp() {
        if (this._modalEl) { this._closeHelp(); return; }
        const backdrop = document.createElement('div');
        backdrop.className = 'kbd-modal-backdrop';
        const modal = document.createElement('div');
        modal.className = 'kbd-modal';
        const title = document.createElement('h3');
        const titleIcon = createIcon('fa-solid fa-keyboard');
        title.append(titleIcon, ' キーボードショートカット');
        modal.appendChild(title);

        this._shortcuts
            .filter(s => s.key !== 'Escape')
            .forEach((s) => {
                const row = document.createElement('div');
                row.className = 'kbd-row';
                const description = document.createElement('span');
                description.textContent = s.description;
                const keys = document.createElement('span');
                if (s.shift) {
                    keys.append(createShortcutKey('Shift'), ' + ');
                }
                if (s.ctrl) {
                    keys.append(createShortcutKey('Ctrl'), ' + ');
                }
                keys.appendChild(createShortcutKey(s.key));
                row.append(description, keys);
                modal.appendChild(row);
            });

        backdrop.appendChild(modal);
        backdrop.addEventListener('click', e => { if (e.target === backdrop) this._closeHelp(); });
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop.classList.add('visible'));
        this._modalEl = backdrop;
    },

    _closeHelp() {
        if (!this._modalEl) return;
        this._modalEl.classList.remove('visible');
        setTimeout(() => { this._modalEl?.remove(); this._modalEl = null; }, 200);
    }
};

function createShortcutKey(label) {
    const key = document.createElement('kbd');
    key.textContent = label;
    return key;
}

function renderSkeleton(container, rows = 5) {
    container.textContent = '';
    Array.from({ length: rows }).forEach(() => {
        const row = document.createElement('div');
        row.className = 'skeleton-row';
        const avatar = document.createElement('div');
        avatar.className = 'skeleton skeleton-avatar';
        const body = document.createElement('div');
        body.className = 'confirm-body';
        const text = document.createElement('div');
        text.className = 'skeleton skeleton-text';
        const shortText = document.createElement('div');
        shortText.className = 'skeleton skeleton-text short';
        body.append(text, shortText);
        row.append(avatar, body);
        container.appendChild(row);
    });
}

function renderSkeletonCards(container, count = 6) {
    container.textContent = '';
    Array.from({ length: count }).forEach(() => {
        const card = document.createElement('div');
        card.className = 'skeleton skeleton-card';
        container.appendChild(card);
    });
}

/**
 * タブリストを WAI-ARIA tablist パターンに準拠させる共有ヘルパ。
 * .tabs[role="tablist"] > .tab-btn[role="tab"][data-tab-target]
 * と .tab-content[role="tabpanel"] の組み合わせを想定。
 * 矢印キー操作と aria-selected/aria-controls/tabindex の同期を行う。
 */
function initTablist(container) {
    const tablist = typeof container === 'string'
        ? document.querySelector(container)
        : container;
    if (!tablist || tablist.dataset.tablistReady === 'true') return;
    tablist.dataset.tablistReady = 'true';
    if (!tablist.getAttribute('role')) tablist.setAttribute('role', 'tablist');

    const tabs = Array.from(tablist.querySelectorAll('[data-tab-target]'));
    tabs.forEach((tab) => {
        if (tab.tagName !== 'BUTTON') return;
        tab.setAttribute('role', 'tab');
        const targetId = tab.dataset.tabTarget;
        const panel = document.getElementById(targetId);
        if (panel) {
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tab.id || targetId + '-tab');
            tab.setAttribute('aria-controls', targetId);
            if (!tab.id) tab.id = targetId + '-tab';
        }
    });

    const syncTab = (tab) => {
        const isActive = tab.classList.contains('active');
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.tabIndex = isActive ? 0 : -1;
    };
    tabs.forEach(syncTab);

    tablist.addEventListener('keydown', (e) => {
        const current = document.activeElement;
        const idx = tabs.indexOf(current);
        if (idx === -1) return;
        let nextIdx = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (idx + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = tabs.length - 1;
        if (nextIdx === null) return;
        e.preventDefault();
        tabs[nextIdx].focus();
        tabs[nextIdx].click();
    });

    // active クラスが切り替わった後に aria を再同期するための公開 API
    tablist._syncTabAria = () => tabs.forEach(syncTab);
}

/**
 * ボタンに送信中状態を設定する。
 * - loading=true の場合、元のラベルを保存し、スピナー + "処理中..." を表示して disabled にする。
 * - loading=false の場合、元のラベルを復元して disabled を解除する。
 * 戻り値はPromiseの解決を待つための補助用（呼び出し側でawait不要）。
 */
function setButtonLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
        if (btn.dataset.loading !== 'true') {
            btn.dataset.originalHtml = btn.innerHTML;
        }
        btn.dataset.loading = 'true';
        btn.disabled = true;
        btn.textContent = '';
        const icon = createIcon('fa-solid fa-circle-notch fa-spin');
        const text = document.createElement('span');
        text.textContent = label || '処理中...';
        btn.append(icon, text);
    } else {
        btn.dataset.loading = 'false';
        btn.disabled = false;
        if (btn.dataset.originalHtml != null) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
    }
}

/**
 * 動的ステータス要素に安全にテキストを設定する。
 * 要素が aria-live を持たなければ付与し、textContent のみで更新（XSS 安全）。
 * type='alert' でエラーを、それ以外は 'polite' で通常ステータスを通知。
 */
function announceStatus(el, message, type) {
    if (!el) return;
    if (!el.getAttribute('aria-live')) {
        el.setAttribute('aria-live', type === 'alert' ? 'assertive' : 'polite');
    }
    if (type === 'alert' && !el.getAttribute('role')) {
        el.setAttribute('role', 'alert');
    } else if (type !== 'alert' && !el.getAttribute('role')) {
        el.setAttribute('role', 'status');
    }
    el.textContent = message || '';
}

/**
 * 複合状態バッジを生成する（色 + アイコン + テキスト）。
 * 状態は色だけでなくテキスト・アイコンでも伝える（WCAG・色のみ禁止）。
 * @param {{status: string, label: string, icon?: string}} opts
 *   status: 'success'|'warning'|'danger'|'info'|'neutral'
 * @returns {HTMLSpanElement} .status-pill 要素
 */
function renderStatusBadge({ status = 'neutral', label = '', icon }) {
    const pill = document.createElement('span');
    pill.className = `status-pill ${status}`;
    const iconName = icon || (
        status === 'success' ? 'circle-check' :
        status === 'warning' ? 'triangle-exclamation' :
        status === 'danger' ? 'circle-xmark' :
        status === 'info' ? 'circle-info' :
        'circle-info'
    );
    const iconEl = createIcon(iconName);
    iconEl.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    pill.append(iconEl, text);
    return pill;
}

/**
 * 空状態をレンダリングする。説明だけでなく「次の行動」を提示。
 * @param {{icon?: string, title: string, hint?: string, action?: {label: string, onClick?: Function, href?: string}}} opts
 * @returns {HTMLDivElement} .empty-state 要素
 */
function renderEmptyState({ icon = 'inbox', title, hint, action }) {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const iconEl = createIcon(icon);
    iconEl.setAttribute('data-icon-size', 'lg');
    iconEl.setAttribute('aria-hidden', 'true');
    wrap.appendChild(iconEl);
    const titleEl = document.createElement('div');
    titleEl.className = 'empty-state-title';
    titleEl.textContent = title || 'データがありません';
    wrap.appendChild(titleEl);
    if (hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'empty-state-hint';
        hintEl.textContent = hint;
        wrap.appendChild(hintEl);
    }
    if (action) {
        const actionWrap = document.createElement('div');
        actionWrap.className = 'empty-state-action';
        let btn;
        if (action.href) {
            btn = document.createElement('a');
            btn.href = action.href;
            btn.className = 'btn cta';
        } else {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn cta';
        }
        btn.textContent = action.label || '操作する';
        if (action.onClick && btn.tagName === 'BUTTON') {
            btn.addEventListener('click', action.onClick);
        }
        actionWrap.appendChild(btn);
        wrap.appendChild(actionWrap);
    }
    return wrap;
}

/**
 * エラー状態をレンダリングする。「何が起きたか」「次に何をするか」を書く。
 * @param {{title?: string, detail: string, recovery?: string, retry?: {label: string, onClick: Function}}} opts
 * @returns {HTMLDivElement} .error-state 要素
 */
function renderErrorState({ title, detail, recovery, retry }) {
    const wrap = document.createElement('div');
    wrap.className = 'error-state';
    wrap.setAttribute('role', 'alert');
    const iconEl = createIcon('circle-xmark');
    iconEl.setAttribute('data-icon-size', 'lg');
    iconEl.setAttribute('aria-hidden', 'true');
    wrap.appendChild(iconEl);
    const titleEl = document.createElement('div');
    titleEl.className = 'error-state-title';
    titleEl.textContent = title || 'エラーが発生しました';
    wrap.appendChild(titleEl);
    if (detail) {
        const detailEl = document.createElement('div');
        detailEl.className = 'error-state-detail';
        detailEl.textContent = detail;
        wrap.appendChild(detailEl);
    }
    if (recovery) {
        const recoveryEl = document.createElement('div');
        recoveryEl.className = 'error-state-recovery';
        recoveryEl.textContent = recovery;
        wrap.appendChild(recoveryEl);
    }
    if (retry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn cta mt-md';
        btn.textContent = retry.label || '再試行';
        if (retry.onClick) btn.addEventListener('click', retry.onClick);
        wrap.appendChild(btn);
    }
    return wrap;
}

/**
 * Readiness チェックリストをレンダリングする（フェーズ毎の必須項目）。
 * @param {{items: Array<{label: string, done: boolean, hint?: string}>}} opts
 * @returns {HTMLDivElement} .checklist 要素
 */
function renderChecklist({ items = [] }) {
    const wrap = document.createElement('div');
    wrap.className = 'checklist';
    const list = document.createElement('ul');
    list.className = 'checklist-items';
    items.forEach((item) => {
        const li = document.createElement('li');
        li.className = `checklist-item ${item.done ? 'is-done' : 'is-pending'}`;
        const mark = document.createElement('span');
        mark.className = 'checklist-mark';
        mark.appendChild(createIcon(item.done ? 'circle-check' : 'circle'));
        mark.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'checklist-label';
        text.textContent = item.label;
        li.append(mark, text);
        if (item.hint) {
            const hint = document.createElement('span');
            hint.className = 'checklist-hint';
            hint.textContent = item.hint;
            li.appendChild(hint);
        }
        list.appendChild(li);
    });
    wrap.appendChild(list);
    return wrap;
}
