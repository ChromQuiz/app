// index.js - Supabase Auth / project creation

function getOrdinalSuffix(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return 'th';
    switch (n % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

function generateStrongPassword() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const num = '0123456789';
    const all = upper + lower + num;
    const required = [
        AppCrypto.randomString(1, upper),
        AppCrypto.randomString(1, lower),
        AppCrypto.randomString(1, num)
    ];
    const chars = (required.join('') + AppCrypto.randomString(11, all)).split('');
    const bytes = AppCrypto.randomBytes(chars.length);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = bytes[i] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

let currentTab = 'join';
let supabaseSession = null;

function getGoogleDisplayName() {
    const user = supabaseSession?.user;
    return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Google User';
}

function showError(msg) {
    const el = document.getElementById('status-msg');
    el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + escapeHtml(msg);
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

function useSupabaseAuth() {
    return Boolean(window.CIQSupabaseAPI?.isEnabled?.());
}

function getLocalhostIndexUrl() {
    return 'http://localhost:8000/index.html';
}

function setTab(tab) {
    currentTab = tab;
    const tabJoin = document.getElementById('tab-join');
    const tabCreate = document.getElementById('tab-create');
    if (tabJoin) tabJoin.className = tab === 'join' ? 'tab active' : 'tab';
    if (tabCreate) tabCreate.className = tab === 'create' ? 'tab active' : 'tab';
    document.getElementById('section-join').hidden = tab !== 'join';
    document.getElementById('section-create').hidden = tab !== 'create';
    renderCreateAuthState();
}

function renderSupabaseAuth(sessionData) {
    const panel = document.getElementById('supabase-auth-panel');
    if (!panel || !useSupabaseAuth()) return;
    panel.hidden = false;

    const userEl = document.getElementById('supabase-auth-user');
    const loginBtn = document.getElementById('supabase-login-btn');
    const logoutBtn = document.getElementById('supabase-logout-btn');
    const email = sessionData?.user?.email || '';
    const displayName = sessionData?.user ? getGoogleDisplayName() : '';

    if (userEl) userEl.textContent = email ? `${displayName} / ${email}` : '未ログイン';
    if (loginBtn) loginBtn.hidden = Boolean(email);
    if (logoutBtn) logoutBtn.hidden = !email;
    renderCreateAuthState();
    renderProjectList();
}

function renderCreateAuthState() {
    if (!useSupabaseAuth()) return;
    const note = document.getElementById('create-auth-note');
    const createBtn = document.getElementById('create-btn');
    const email = supabaseSession?.user?.email || '';

    if (note) {
        note.classList.toggle('ready', Boolean(email));
        note.innerHTML = email
            ? '<i class="fa-solid fa-circle-check"></i><span>Googleログイン済みです。新しいプロジェクトを作成できます。</span>'
            : '<i class="fa-solid fa-circle-info"></i><span>新規作成にはGoogleログインが必要です。</span>';
    }
    if (createBtn) {
        createBtn.disabled = !email;
        createBtn.innerHTML = email
            ? '新しいプロジェクトを作成 <i class="fa-solid fa-plus"></i>'
            : 'Googleログイン後に作成できます';
    }
}

function renderProjectListEmpty(message) {
    const list = document.getElementById('project-list');
    if (!list) return;
    list.innerHTML = `<div class="project-list-empty">${escapeHtml(message)}</div>`;
}

function getRoleLabel(role) {
    if (role === 'owner') return '所有者';
    if (role === 'admin') return '管理者';
    if (role === 'scorer') return '採点者';
    return role || '';
}

async function renderProjectList() {
    const note = document.getElementById('project-list-note');
    const list = document.getElementById('project-list');
    if (!list || !useSupabaseAuth()) return;

    if (!supabaseSession?.user) {
        if (note) {
            note.classList.remove('ready');
            note.innerHTML = '<i class="fa-solid fa-circle-info"></i><span>Googleログインすると、参加中のプロジェクトが表示されます。</span>';
        }
        renderProjectListEmpty('ログイン待ち');
        return;
    }

    list.innerHTML = '<div class="project-list-empty"><i class="fa-solid fa-spinner fa-spin"></i> 読み込み中...</div>';
    try {
        const projects = await CIQSupabaseAPI.listMyProjects();
        if (note) {
            note.classList.toggle('ready', projects.length > 0);
            note.innerHTML = projects.length > 0
                ? '<i class="fa-solid fa-circle-check"></i><span>参加中のプロジェクトを選択して開きます。</span>'
                : '<i class="fa-solid fa-circle-info"></i><span>新規作成するか、採点者コードでプロジェクトに参加してください。</span>';
        }
        if (projects.length === 0) {
            renderProjectListEmpty('プロジェクトはまだありません');
            return;
        }
        list.innerHTML = projects.map((project) => `
            <button type="button" class="project-list-item" data-project-id="${escapeHtml(project.id)}" data-project-name="${escapeHtml(project.name)}" data-role="${escapeHtml(project.role)}" data-display-name="${escapeHtml(project.displayName)}">
                <span>
                    <strong>${escapeHtml(project.name)}</strong>
                    <small>${escapeHtml(project.id)} / ${escapeHtml(getRoleLabel(project.role))}</small>
                </span>
                <i class="fa-solid fa-arrow-right"></i>
            </button>
        `).join('');
        list.querySelectorAll('.project-list-item').forEach((button) => {
            button.addEventListener('click', () => {
                openSupabaseProject(
                    button.dataset.projectId,
                    button.dataset.projectName,
                    button.dataset.role,
                    button.dataset.displayName
                );
            });
        });
    } catch (e) {
        renderProjectListEmpty('プロジェクトを読み込めませんでした');
        console.error(e);
    }
}

function openSupabaseProject(projectId, projectName, role, displayName) {
    session.set('projectId', projectId);
    session.set('projectName', projectName);
    session.set('scorer_name', displayName || supabaseSession?.user?.email || '');
    session.set('scorer_role', role === 'scorer' ? 'scorer' : 'admin');
    session.set('supabaseMode', 'true');
    location.href = 'admin.html';
}

async function joinProjectAsScorer() {
    const btn = document.getElementById('join-scorer-btn');
    const projectId = document.getElementById('join-project-id').value.trim().toLowerCase();
    const accessCode = document.getElementById('join-scorer-code').value.trim();

    if (!supabaseSession?.user) {
        showError('先にGoogleでログインしてください。');
        return;
    }
    if (!projectId || !accessCode) {
        showError('プロジェクトIDと採点者コードを入力してください。');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 確認中...';
    try {
        const codeHash = await AppCrypto.hashPassword(accessCode);
        const joined = await CIQSupabaseAPI.joinProjectWithScorerCode(projectId, codeHash);
        const projects = await CIQSupabaseAPI.listMyProjects();
        const project = projects.find(p => p.id === projectId);
        openSupabaseProject(
            projectId,
            project?.name || projectId,
            joined.role,
            joined.display_name || getGoogleDisplayName()
        );
    } catch (e) {
        showError(e.message);
        btn.disabled = false;
        btn.innerHTML = '参加する <i class="fa-solid fa-arrow-right-to-bracket"></i>';
    }
}

async function signInWithSupabaseGoogle() {
    if (location.protocol === 'file:') {
        location.href = getLocalhostIndexUrl();
        return;
    }
    if (!useSupabaseAuth()) {
        showError(window.CIQSupabaseAPI?.getConfigErrorMessage?.() || 'Supabase設定が見つかりません。');
        return;
    }
    try {
        await CIQSupabaseAPI.signInWithGoogle();
    } catch (e) {
        showError('Googleログインを開始できませんでした: ' + e.message);
    }
}

async function signOutSupabase() {
    try {
        await CIQSupabaseAPI.signOut();
        session.clear();
    } catch (e) {
        showError('ログアウトに失敗しました: ' + e.message);
    }
}

async function copyToClipboard(id, btn) {
    const input = document.getElementById(id);
    try {
        await navigator.clipboard.writeText(input.value);
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => btn.innerHTML = orig, 1500);
    } catch (err) {
        showError('コピーに失敗しました');
    }
}

async function createProject() {
    const edition = parseInt(document.getElementById('create-edition').value, 10);
    const recoveryPassword = generateStrongPassword();
    const scorerCode = generateStrongPassword();
    const btn = document.getElementById('create-btn');

    if (!supabaseSession?.user) {
        showError('先にGoogleでログインしてください。');
        return;
    }
    if (!edition || edition < 1) {
        showError('回数を入力してください。');
        return;
    }

    const pid = `ciq${edition}`;
    const pName = `CIQ the ${edition}${getOrdinalSuffix(edition)}`;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 作成中...';

    try {
        const { publicKeyJwk, privateKeyJwk } = await AppCrypto.generateRSAKeyPair();
        const encryptedPriv = await AppCrypto.encryptAES(JSON.stringify(privateKeyJwk), recoveryPassword);
        const scorerAccessCodeHash = await AppCrypto.hashPassword(scorerCode);
        const ownerDisplayName = getGoogleDisplayName();

        await CIQSupabaseAPI.createProjectWithOwner({
            projectId: pid,
            name: pName,
            publicKey: publicKeyJwk,
            encryptedPrivateKey: encryptedPriv,
            ownerDisplayName,
            scorerAccessCodeHash,
        });

        session.set('projectId', pid);
        session.set('projectName', pName);
        session.set('scorer_name', ownerDisplayName);
        session.set('scorer_role', 'admin');
        session.set('supabaseMode', 'true');
        session.set('privateKeyJwk', JSON.stringify(privateKeyJwk));

        const tabsContainer = document.getElementById('tabs-container');
        if (tabsContainer) tabsContainer.hidden = true;
        document.getElementById('section-create').hidden = true;
        document.getElementById('section-join').hidden = true;
        document.getElementById('section-success').hidden = false;
        document.getElementById('success-id').value = pid;
        document.getElementById('success-admin-pwd').value = recoveryPassword;
        document.getElementById('success-pwd').value = scorerCode;
        const adminPwdLabel = document.getElementById('success-admin-pwd-label');
        if (adminPwdLabel) adminPwdLabel.innerHTML = '<i class="fa-solid fa-key crown-icon"></i> 秘密鍵復旧パスワード';

        await renderProjectList();
    } catch (e) {
        showError('作成に失敗しました: ' + e.message);
        btn.disabled = false;
        renderCreateAuthState();
    }
}

async function initSupabaseAuth() {
    if (!useSupabaseAuth()) {
        const panel = document.getElementById('supabase-auth-panel');
        const userEl = document.getElementById('supabase-auth-user');
        const loginBtn = document.getElementById('supabase-login-btn');
        if (panel) panel.hidden = false;
        if (userEl) {
            userEl.textContent = location.protocol === 'file:'
                ? 'ローカルサーバーで開く必要があります'
                : 'Supabase未接続';
        }
        if (loginBtn) {
            loginBtn.hidden = false;
            loginBtn.textContent = location.protocol === 'file:'
                ? 'localhostで開く'
                : '設定を確認';
        }
        showError(location.protocol === 'file:'
            ? 'Googleログインは file:// では開始できません。ローカルサーバーで開いてください。'
            : (window.CIQSupabaseAPI?.getConfigErrorMessage?.() || 'Supabase設定が見つかりません。'));
        return;
    }
    try {
        supabaseSession = await CIQSupabaseAPI.getSession();
        renderSupabaseAuth(supabaseSession);
        CIQSupabaseAPI.onAuthStateChange((sessionData) => {
            supabaseSession = sessionData;
            renderSupabaseAuth(sessionData);
        });
    } catch (e) {
        showError('ログイン状態を確認できませんでした: ' + e.message);
    }
}

document.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' && currentTab === 'create') createProject();
});

document.addEventListener('DOMContentLoaded', initSupabaseAuth);
