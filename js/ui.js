/**
 * CIQ 共通 UI ユーティリティ (ui.js)
 * db.js の後に読み込むこと。
 */

function padNum(n) { return String(n).padStart(3, '0'); }

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function createIcon(className) {
    const icon = document.createElement('i');
    icon.className = className;
    return icon;
}

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
        if (panel && panel.classList.contains('open')) toggleMenu();
    }
});

function toggleMenu() {
    const panel = document.getElementById('menu-panel');
    const backdrop = document.getElementById('menu-backdrop');
    if (!panel || !backdrop) return;
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
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
    const icon = document.createElement('i');
    icon.className = `fa-solid ${icons[type] || icons.info}`;
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
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-triangle-exclamation confirm-icon';
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
        const titleIcon = document.createElement('i');
        titleIcon.className = 'fa-solid fa-keyboard';
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
