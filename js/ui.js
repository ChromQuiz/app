/**
 * CIQ 共通 UI ユーティリティ (ui.js)
 * db.js の後に読み込むこと。
 */

function padNum(n) { return String(n).padStart(3, '0'); }

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

    overlay.innerHTML = `
        <div class="preview-header">
            <h2><i class="fa-solid fa-file-image"></i> ${name} の解答用紙</h2>
            <button class="preview-close" onclick="document.getElementById('preview-overlay').style.display='none'">✕ 閉じる</button>
        </div>
        <div id="preview-content" class="preview-overlay-content">
            <div class="text-muted-loader"><i class="fa-solid fa-spinner fa-spin"></i> 読み込み中...</div>
        </div>`;

    overlay.style.display = 'block';

    const pc = document.getElementById('preview-content');
    try {
        const page = await CIQSupabaseAPI.getAnswerPageByEntryNumber(projectId, entryNum);
        if (page?.storage_path) {
            const signedUrl = await CIQSupabaseAPI.getAnswerPageUrl(page.storage_path);
            pc.innerHTML = `<img src="${signedUrl}" alt="${escapeHtml(name)}" class="preview-image">`;
        } else {
            pc.innerHTML = '<div class="text-muted-center">ページ画像が保存されていません。管理画面から答案を再読み込みしてください。</div>';
        }
    } catch (e) {
        pc.innerHTML = `<div class="text-muted-center">ページ画像を読み込めませんでした: ${escapeHtml(e.message)}</div>`;
    }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const o = document.getElementById('preview-overlay');
        if (o) o.style.display = 'none';
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
    document.body.style.overflow = isOpen ? '' : 'hidden';
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
        document.body.innerHTML = '<div class="auth-redirect">管理者としてプロジェクトに入室してください。3秒後にトップページへ戻ります。</div>';
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
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
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

        overlay.innerHTML = `
            <div class="confirm-dialog glass-panel">
                <i class="fa-solid fa-triangle-exclamation confirm-icon"></i>
                <div class="confirm-message">${message}</div>
                <div class="confirm-actions">
                    <button class="btn secondary confirm-cancel">キャンセル</button>
                    <button class="btn danger confirm-ok">${confirmText}</button>
                </div>
            </div>
        `;

        overlay.querySelector('.confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('.confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
        overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        document.body.appendChild(overlay);
        overlay.querySelector('.confirm-ok').focus();
    });
}

const ConnectionMonitor = {
    _offlineBanner: null,
    _onlineBanner: null,
    _wasOffline: false,

    init() {
        this._offlineBanner = document.createElement('div');
        this._offlineBanner.className = 'offline-banner';
        this._offlineBanner.innerHTML = '<i class="fa-solid fa-wifi"></i> インターネット接続が切断されました';
        document.body.appendChild(this._offlineBanner);

        this._onlineBanner = document.createElement('div');
        this._onlineBanner.className = 'online-banner';
        this._onlineBanner.innerHTML = '<i class="fa-solid fa-check-circle"></i> 接続が回復しました';
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
        backdrop.innerHTML = `
            <div class="kbd-modal">
                <h3><i class="fa-solid fa-keyboard"></i> キーボードショートカット</h3>
                ${this._shortcuts
                    .filter(s => s.key !== 'Escape')
                    .map(s => `
                        <div class="kbd-row">
                            <span>${s.description}</span>
                            <span>${s.shift ? '<kbd>Shift</kbd> + ' : ''}${s.ctrl ? '<kbd>Ctrl</kbd> + ' : ''}<kbd>${s.key}</kbd></span>
                        </div>
                    `).join('')}
            </div>
        `;
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

function renderSkeleton(container, rows = 5) {
    container.innerHTML = Array.from({ length: rows }, () => `
        <div class="skeleton-row">
            <div class="skeleton skeleton-avatar"></div>
            <div class="confirm-body">
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text short"></div>
            </div>
        </div>
    `).join('');
}

function renderSkeletonCards(container, count = 6) {
    container.innerHTML = Array.from({ length: count }, () =>
        '<div class="skeleton skeleton-card"></div>'
    ).join('');
}
