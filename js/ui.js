/**
 * CIQ 共通 UI ユーティリティ (ui.js)
 * db.js の後に読み込むこと。
 * 注意: createIcon は js/icons.js で定義されるLucideベースのアイコン生成関数。
 */

function padNum(n) { return String(n).padStart(3, '0'); }

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function createIconLegacyBridge(nameOrClass, opts) {
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

function createPreviewHeader(titleText, onClose) {
    const header = document.createElement('div');
    header.className = 'preview-overlay-header';

    const title = document.createElement('h2');
    title.className = 'preview-overlay-title';
    title.append(createIcon('file-image'), ` ${titleText}`);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'preview-close';
    closeButton.setAttribute('aria-label', '閉じる');
    closeButton.title = '閉じる';
    closeButton.append(createIcon('xmark', { size: 16 }), ' 閉じる');
    closeButton.addEventListener('click', onClose);

    header.append(title, closeButton);
    return header;
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
    const name = masterData[entryNum]?.name || `No.${padNum(entryNum)}`;

    overlay.textContent = '';
    const header = createPreviewHeader(`${name} の解答用紙`, () => { overlay.classList.remove('show'); });

    const pc = document.createElement('div');
    pc.id = 'preview-content';
    pc.className = 'preview-overlay-content';
    const loading = document.createElement('div');
    loading.className = 'text-muted-loader';
    loading.append(createIcon('spinner'), ' 読み込み中...');
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
        if (panel && panel.classList.contains('active')) toggleMenu(false);
    }
});

let menuReturnFocus = null;

document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('menu-panel');
    if (!panel || panel.classList.contains('active')) return;
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('inert', '');
});

document.addEventListener('DOMContentLoaded', () => {
    initCustomSelects(document);
});

function initCustomSelects(root = document) {
    root.querySelectorAll('select:not([multiple]):not([data-native-select]):not([data-custom-select-bound])')
        .forEach(enhanceSelect);
}

function enhanceSelect(select) {
    select.dataset.customSelectBound = 'true';
    const wrap = document.createElement('div');
    wrap.className = 'ciq-select';
    if (select.classList.contains('u-full-width')) wrap.classList.add('u-full-width');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ciq-select-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    if (select.id) {
        const sourceLabel = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
        if (sourceLabel?.textContent) button.setAttribute('aria-label', sourceLabel.textContent.trim());
    }
    const label = document.createElement('span');
    label.className = 'ciq-select-label';
    button.appendChild(label);
    const menu = document.createElement('div');
    menu.className = 'ciq-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    select.parentNode.insertBefore(wrap, select);
    wrap.append(select, button, menu);
    select.classList.add('ciq-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const optionNodes = [];
    let closeTimer = 0;
    const placeMenu = () => {
        const rect = button.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        const above = rect.top;
        wrap.dataset.place = below < 260 && above > below ? 'above' : 'below';
    };
    const close = () => {
        clearTimeout(closeTimer);
        wrap.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        closeTimer = window.setTimeout(() => {
            if (!wrap.classList.contains('is-open')) menu.hidden = true;
        }, 160);
        optionNodes.forEach((node) => node.classList.remove('is-active'));
    };
    const sync = () => {
        const option = select.options[select.selectedIndex];
        label.textContent = option?.textContent || '';
        optionNodes.forEach((node, index) => {
            const isSelected = index === select.selectedIndex;
            node.classList.toggle('is-selected', isSelected);
            node.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    };
    const choose = (index) => {
        const option = select.options[index];
        if (!option || option.disabled) return;
        select.selectedIndex = index;
        sync();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
        button.focus();
    };
    const setActive = (index) => {
        const next = Math.max(0, Math.min(optionNodes.length - 1, index));
        optionNodes.forEach((node, nodeIndex) => node.classList.toggle('is-active', nodeIndex === next));
        optionNodes[next]?.scrollIntoView({ block: 'nearest' });
        return next;
    };
    const open = () => {
        clearTimeout(closeTimer);
        button.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        placeMenu();
        requestAnimationFrame(() => wrap.classList.add('is-open'));
        setActive(select.selectedIndex >= 0 ? select.selectedIndex : 0);
    };

    Array.from(select.options).forEach((option, index) => {
        const node = document.createElement('div');
        node.className = 'ciq-select-option';
        node.setAttribute('role', 'option');
        node.textContent = option.textContent;
        if (option.disabled) {
            node.classList.add('is-disabled');
            node.setAttribute('aria-disabled', 'true');
        }
        node.addEventListener('click', () => choose(index));
        menu.appendChild(node);
        optionNodes.push(node);
    });
    button.addEventListener('click', () => (wrap.classList.contains('is-open') ? close() : open()));
    button.addEventListener('keydown', (event) => {
        const activeIndex = optionNodes.findIndex((node) => node.classList.contains('is-active'));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (menu.hidden) open();
            setActive((activeIndex < 0 ? select.selectedIndex : activeIndex) + (event.key === 'ArrowDown' ? 1 : -1));
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (menu.hidden) open();
            else choose(activeIndex >= 0 ? activeIndex : select.selectedIndex);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    });
    select.addEventListener('change', sync);
    select.addEventListener('focus', () => button.focus());
    document.addEventListener('click', (event) => {
        if (!wrap.contains(event.target)) close();
    });
    sync();
}

function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.getClientRects().length > 0 && el.getAttribute('aria-hidden') !== 'true');
}

function trapFocusWithin(event, container) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function handleMenuKeydown(event) {
    const panel = event.currentTarget;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(false);
        return;
    }
    trapFocusWithin(event, panel);
}

function toggleMenu(forceOpen) {
    const panel = document.getElementById('menu-panel');
    const backdrop = document.getElementById('menu-backdrop');
    if (!panel || !backdrop) return;
    const isOpen = panel.classList.contains('active');
    const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
    if (isOpen === nextOpen) return;

    panel.classList.toggle('active', nextOpen);
    backdrop.classList.toggle('active', nextOpen);
    document.body.classList.toggle('body-scroll-locked', nextOpen);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', panel.getAttribute('aria-label') || 'メニュー');
    panel.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    panel.toggleAttribute('inert', !nextOpen);
    backdrop.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    document.querySelectorAll('.menu-trigger[data-toggle-menu]').forEach((trigger) => {
        trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        trigger.setAttribute('aria-controls', panel.id);
    });

    if (nextOpen) {
        menuReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel.tabIndex = -1;
        panel.addEventListener('keydown', handleMenuKeydown);
        requestAnimationFrame(() => {
            const preferred = panel.querySelector('.menu-panel-close') || getFocusableElements(panel)[0] || panel;
            preferred.focus();
        });
    } else {
        panel.removeEventListener('keydown', handleMenuKeydown);
        if (menuReturnFocus?.isConnected) menuReturnFocus.focus();
        menuReturnFocus = null;
    }
}

function closeMenuForPageRestore() {
    const panel = document.getElementById('menu-panel');
    const backdrop = document.getElementById('menu-backdrop');
    if (!panel || !backdrop) return;
    panel.classList.remove('active');
    backdrop.classList.remove('active');
    document.body.classList.remove('body-scroll-locked');
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('aria-modal', 'false');
    panel.toggleAttribute('inert', true);
    backdrop.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.menu-trigger[data-toggle-menu]').forEach((trigger) => {
        trigger.setAttribute('aria-expanded', 'false');
    });
    panel.removeEventListener('keydown', handleMenuKeydown);
    menuReturnFocus = null;
}

window.addEventListener('pageshow', closeMenuForPageRestore);

/**
 * 運営共通シェルの「戻る」先をロールで決める。
 * 管理者 → 運営ホーム(admin.html) / 採点者 → 採点ボード(judge.html)。
 * 権限のないページへは戻さない。
 */
function opsBackTarget() {
    return session.scorerRole === 'admin' ? 'admin.html' : 'judge.html';
}

function opsBackLabel() {
    return session.scorerRole === 'admin' ? '運営' : '採点ボード';
}

function navigateBack(fallback = 'index.html') {
    closeMenuForPageRestore();
    let canUseHistory = window.history.length > 1;
    if (document.referrer) {
        try {
            canUseHistory = canUseHistory && new URL(document.referrer).origin === location.origin;
        } catch (_) {
            canUseHistory = false;
        }
    }
    if (canUseHistory) {
        window.history.back();
        return;
    }
    location.href = fallback;
}

document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-history-back]');
    if (!trigger) return;
    event.preventDefault();
    navigateBack(trigger.dataset.backFallback || trigger.getAttribute('href') || 'index.html');
});

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
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'false');
        document.body.appendChild(container);
    }
    container.querySelectorAll(`.toast-${CSS.escape(type)}`).forEach((existing) => {
        existing.classList.remove('show');
        existing.classList.add('hide');
        window.setTimeout(() => existing.remove(), 180);
    });
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' || type === 'warning' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    const body = document.createElement('span');
    body.className = 'toast-body';
    const text = document.createElement('span');
    text.className = 'toast-message';
    // ASVS 1.2.1: status text is rendered as text, never interpreted as markup.
    text.textContent = String(msg || '');
    body.append(text);
    toast.append(body);
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 400);
    }, Math.max(1000, Number(duration) || 3000));
}

function setPageMessage(el, message, type = 'info') {
    if (!el) return;
    const text = String(message || '');
    el.textContent = text;
    el.className = `page-msg ${type || 'info'}`.trim();
    el.classList.toggle('is-visible', Boolean(text));
    el.setAttribute('aria-live', type === 'error' || type === 'warning' ? 'assertive' : 'polite');
    el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
}

function clearPageMessage(el) {
    if (!el) return;
    el.textContent = '';
    el.className = 'page-msg';
    el.classList.remove('is-visible');
}

let confirmDialogSequence = 0;

function showConfirm(message, confirmText = '削除する') {
    return new Promise(resolve => {
        const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const wasScrollLocked = document.body.classList.contains('body-scroll-locked');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', '確認');
        dialog.tabIndex = -1;
        const icon = createIcon('triangle-exclamation', { className: 'confirm-icon' });
        const titleEl = document.createElement('div');
        titleEl.className = 'confirm-title';
        titleEl.id = `confirm-title-${confirmDialogSequence + 1}`;
        titleEl.textContent = '確認';
        const messageEl = document.createElement('div');
        messageEl.className = 'confirm-message';
        messageEl.id = `confirm-message-${++confirmDialogSequence}`;
        dialog.setAttribute('aria-labelledby', titleEl.id);
        dialog.setAttribute('aria-describedby', messageEl.id);
        // ASVS 1.2.1: untrusted confirmation content is kept in a text node.
        messageEl.textContent = String(message || '');
        const actions = document.createElement('div');
        actions.className = 'confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn secondary confirm-cancel';
        cancelBtn.textContent = 'キャンセル';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'btn danger confirm-ok';
        okBtn.textContent = String(confirmText || '削除する');
        actions.append(cancelBtn, okBtn);
        dialog.append(icon, titleEl, messageEl, actions);
        overlay.appendChild(dialog);

        let settled = false;
        const finish = (confirmed) => {
            if (settled) return;
            settled = true;
            dialog.removeEventListener('keydown', onKeydown);
            overlay.classList.remove('is-visible');
            window.setTimeout(() => overlay.remove(), 180);
            if (!wasScrollLocked) document.body.classList.remove('body-scroll-locked');
            if (returnFocus?.isConnected) returnFocus.focus();
            resolve(confirmed);
        };
        const onKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finish(false);
                return;
            }
            trapFocusWithin(event, dialog);
        };

        cancelBtn.addEventListener('click', () => finish(false));
        okBtn.addEventListener('click', () => finish(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
        dialog.addEventListener('keydown', onKeydown);
        document.body.appendChild(overlay);
        document.body.classList.add('body-scroll-locked');
        requestAnimationFrame(() => {
            overlay.classList.add('is-visible');
            cancelBtn.focus();
        });
    });
}

const ConnectionMonitor = {
    _offlineBanner: null,
    _onlineBanner: null,
    _wasOffline: false,

    init() {
        this._offlineBanner = document.createElement('div');
        this._offlineBanner.className = 'offline-banner';
        this._offlineBanner.append(createIcon('wifi'), ' インターネット接続が切断されました');
        document.body.appendChild(this._offlineBanner);

        this._onlineBanner = document.createElement('div');
        this._onlineBanner.className = 'online-banner';
        this._onlineBanner.append(createIcon('check-circle'), ' 接続が回復しました');
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
        const titleIcon = createIcon('keyboard');
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
const buttonContentSnapshots = new WeakMap();

function setButtonLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
        if (btn.dataset.loading !== 'true' && !buttonContentSnapshots.has(btn)) {
            const content = document.createDocumentFragment();
            while (btn.firstChild) content.appendChild(btn.firstChild);
            buttonContentSnapshots.set(btn, { content, wasDisabled: btn.disabled });
        }
        btn.dataset.loading = 'true';
        btn.setAttribute('aria-busy', 'true');
        btn.disabled = true;
        const icon = createIcon('circle-notch');
        const text = document.createElement('span');
        text.textContent = label || '処理中...';
        btn.replaceChildren(icon, text);
    } else {
        btn.dataset.loading = 'false';
        btn.removeAttribute('aria-busy');
        const snapshot = buttonContentSnapshots.get(btn);
        if (snapshot) {
            btn.replaceChildren(snapshot.content);
            btn.disabled = snapshot.wasDisabled;
            buttonContentSnapshots.delete(btn);
        } else {
            btn.disabled = false;
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
