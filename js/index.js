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

// 作成モードは #create でのみ到達する(参加者導線には出さない)
function tabFromLocation() {
    return location.hash === '#create' ? 'create' : 'join';
}

let currentTab = tabFromLocation();
let supabaseSession = null;

/**
 * プロジェクト作成の権限ゲート。
 * 現在は Google 認証のみを要求。将来は招待コード・許可ユーザーリスト・
 * サーバー側チェックをこの1点に差し込む(config.local.js 等のフラグで切替)。
 */
function canCreateProject() {
    return Boolean(supabaseSession?.user);
}

function getGoogleDisplayName() {
    const user = supabaseSession?.user;
    return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Google User';
}

function icon(className) {
    const el = createIcon(className);
    return el;
}

function setIconText(el, iconClass, text) {
    if (!el) return;
    el.textContent = '';
    if (iconClass) el.append(icon(iconClass), ' ');
    if (text) el.appendChild(document.createTextNode(text));
}

function setButtonContent(button, text, iconClass = '', iconAfter = true) {
    if (!button) return;
    button.textContent = '';
    if (iconClass && !iconAfter) button.append(icon(iconClass), ' ');
    button.appendChild(document.createTextNode(text));
    if (iconClass && iconAfter) button.append(' ', icon(iconClass));
}

function showError(msg) {
    const el = document.getElementById('status-msg');
    setIconText(el, 'triangle-exclamation', msg);
    el.classList.add('is-visible');
    setTimeout(() => el.classList.remove('is-visible'), 5000);
}

function useSupabaseAuth() {
    return Boolean(window.CIQSupabaseAPI?.isEnabled?.());
}

function setAuthButtonVisibility(loginBtn, logoutBtn, signedIn) {
    if (loginBtn) {
        loginBtn.hidden = signedIn;
        loginBtn.classList.toggle('u-hidden', signedIn);
    }
    if (logoutBtn) {
        logoutBtn.hidden = !signedIn;
        logoutBtn.classList.toggle('u-hidden', !signedIn);
    }
}

function getPublicIndexUrl() {
    return 'https://chromquiz.github.io/app/';
}

function setTab(tab) {
    currentTab = tab;
    const joinSection = document.getElementById('section-join');
    const createSection = document.getElementById('section-create');
    const signedIn = Boolean(supabaseSession?.user);
    if (joinSection) joinSection.hidden = tab !== 'join' || !signedIn;
    if (createSection) createSection.hidden = tab !== 'create' || !signedIn;

    // モード表示とフッター導線(作成モードでは参加への戻り導線を出す)
    const title = document.getElementById('index-mode-title');
    if (title) title.textContent = tab === 'create' ? 'プロジェクト作成' : 'ログイン';
    document.title = tab === 'create' ? 'プロジェクト作成 - CIQ' : 'CIQ';
    document.getElementById('index-create-link')?.classList.toggle('u-hidden', tab === 'create');
    document.getElementById('index-join-link')?.classList.toggle('u-hidden', tab !== 'create');

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

    if (userEl) userEl.textContent = email ? `${displayName} / ${email}` : '';
    panel.classList.toggle('is-signed-in', Boolean(email));
    setAuthButtonVisibility(loginBtn, logoutBtn, Boolean(email));
    setTab(currentTab);
    renderCreateAuthState();
    renderProjectList();
}

function renderCreateAuthState() {
    if (!useSupabaseAuth()) return;
    const createBtn = document.getElementById('create-btn');
    const email = supabaseSession?.user?.email || '';

    const createSection = document.getElementById('section-create');
    if (createSection) createSection.hidden = currentTab !== 'create' || !email;
    if (createBtn) {
        createBtn.disabled = !email;
        setButtonContent(createBtn, '作成', email ? 'plus' : '');
    }
}

function clearProjectList() {
    const list = document.getElementById('project-list');
    if (!list) return;
    list.textContent = '';
}

function getRoleLabel(role) {
    if (role === 'owner') return '所有者';
    if (role === 'admin') return '管理者';
    if (role === 'scorer') return '採点者';
    return role || '';
}

async function renderProjectList() {
    const list = document.getElementById('project-list');
    if (!list || !useSupabaseAuth()) return;

    if (!supabaseSession?.user) {
        clearProjectList();
        return;
    }
    if (currentTab !== 'join') return;

    list.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'project-list-empty';
    loading.append(icon('spinner'), ' 読み込み中...');
    list.appendChild(loading);
    try {
        const projects = await CIQSupabaseAPI.listMyProjects();
        if (projects.length === 0) {
            clearProjectList();
            return;
        }
        list.textContent = '';
        projects.forEach((project) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'project-list-item';
            const textWrap = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = project.name;
            const meta = document.createElement('small');
            meta.textContent = `${project.id} / ${getRoleLabel(project.role)}`;
            textWrap.append(name, meta);
            button.append(textWrap, icon('arrow-right'));
            button.addEventListener('click', () => {
                openSupabaseProject(
                    project.id,
                    project.name,
                    project.role,
                    project.displayName
                );
            });
            list.appendChild(button);
        });
    } catch (e) {
        clearProjectList();
        showError('プロジェクトを読み込めませんでした。');
        console.error(e);
    }
}

function openSupabaseProject(projectId, projectName, role, displayName) {
    session.set('projectId', projectId);
    session.set('projectName', projectName);
    session.set('scorer_name', displayName || supabaseSession?.user?.email || '');
    const normalizedRole = role === 'scorer' ? 'scorer' : 'admin';
    session.set('scorer_role', normalizedRole);
    session.set('supabaseMode', 'true');
    location.href = normalizedRole === 'scorer' ? 'judge.html' : 'admin.html';
}

async function joinProjectAsScorer() {
    const btn = document.getElementById('join-scorer-btn');
    const projectId = document.getElementById('join-project-id').value.trim().toLowerCase();
    const accessCode = document.getElementById('join-scorer-code').value.trim();

    if (!supabaseSession?.user) {
        showError('先にGoogleアカウントでサインインしてください。');
        return;
    }
    if (!projectId || !accessCode) {
        showError('プロジェクトIDとパスワードを入力してください。');
        return;
    }

    btn.disabled = true;
    setButtonContent(btn, '確認中...', 'circle-notch', false);
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
        setButtonContent(btn, 'プロジェクトに参加', 'arrow-right-to-bracket');
    }
}

async function signInWithSupabaseGoogle() {
    if (location.protocol === 'file:') {
        location.href = getPublicIndexUrl();
        return;
    }
    if (!useSupabaseAuth()) {
        showError(window.CIQSupabaseAPI?.getConfigErrorMessage?.() || 'Supabase設定が見つかりません。');
        return;
    }
    try {
        await CIQSupabaseAPI.signInWithGoogle();
    } catch (e) {
        showError('Googleサインインを開始できませんでした: ' + e.message);
    }
}

async function signOutSupabase() {
    try {
        await CIQSupabaseAPI.signOut();
        session.clear();
    } catch (e) {
        showError('Googleサインアウトに失敗しました: ' + e.message);
    }
}

async function copyToClipboard(id, btn) {
    const input = document.getElementById(id);
    try {
        await navigator.clipboard.writeText(input.value);
        setButtonContent(btn, '', 'check', false);
        setTimeout(() => setButtonContent(btn, '', 'copy', false), 1500);
    } catch (err) {
        showError('コピーに失敗しました');
    }
}

async function createProject() {
    const edition = parseInt(document.getElementById('create-edition').value, 10);
    const keyWrappingPassword = generateStrongPassword();
    const scorerCode = generateStrongPassword();
    const btn = document.getElementById('create-btn');

    if (!canCreateProject()) {
        showError('先にGoogleアカウントでサインインしてください。');
        return;
    }
    if (!edition || edition < 1) {
        showError('回数を入力してください。');
        return;
    }

    const pid = `ciq${edition}`;
    const pName = `CIQ the ${edition}${getOrdinalSuffix(edition)}`;

    btn.disabled = true;
    setButtonContent(btn, '作成中...', 'circle-notch', false);

    try {
        const { publicKeyJwk, privateKeyJwk } = await AppCrypto.generateRSAKeyPair();
        const encryptedPriv = await AppCrypto.encryptAES(JSON.stringify(privateKeyJwk), keyWrappingPassword);
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

        CIQSupabaseAPI.storeProjectPrivateKey(pid, privateKeyJwk)
            .catch(error => console.warn('プロジェクト鍵の自動保管に失敗:', error));

        session.set('projectId', pid);
        session.set('projectName', pName);
        session.set('scorer_name', ownerDisplayName);
        session.set('scorer_role', 'admin');
        session.set('supabaseMode', 'true');
        session.set('privateKeyJwk', JSON.stringify(privateKeyJwk));

        const tabsContainer = document.getElementById('tabs-container');
        if (tabsContainer) tabsContainer.hidden = true;
        const createSection = document.getElementById('section-create');
        const joinSection = document.getElementById('section-join');
        const successSection = document.getElementById('section-success');
        if (createSection) createSection.hidden = true;
        if (joinSection) joinSection.hidden = true;
        if (successSection) successSection.hidden = false;
        const successId = document.getElementById('success-id');
        const successPwd = document.getElementById('success-pwd');
        if (successId) successId.value = pid;
        if (successPwd) successPwd.value = scorerCode;

        await renderProjectList();
    } catch (e) {
        showError('作成に失敗しました: ' + e.message);
        btn.disabled = false;
        renderCreateAuthState();
    }
}

function setupIndexEvents() {
    document.getElementById('supabase-login-btn')?.addEventListener('click', signInWithSupabaseGoogle);
    document.getElementById('supabase-logout-btn')?.addEventListener('click', signOutSupabase);
    document.getElementById('tab-join')?.addEventListener('click', () => setTab('join'));
    document.getElementById('tab-create')?.addEventListener('click', () => setTab('create'));
    document.getElementById('join-scorer-btn')?.addEventListener('click', joinProjectAsScorer);
    document.getElementById('create-btn')?.addEventListener('click', createProject);
    document.querySelectorAll('[data-copy-target]').forEach((button) => {
        button.addEventListener('click', () => copyToClipboard(button.dataset.copyTarget, button));
    });
    document.getElementById('admin-proceed-btn')?.addEventListener('click', () => {
        location.href = 'admin.html';
    });
    setTab(currentTab);
}

async function initSupabaseAuth() {
    if (!useSupabaseAuth()) {
        const panel = document.getElementById('supabase-auth-panel');
        const userEl = document.getElementById('supabase-auth-user');
        const loginBtn = document.getElementById('supabase-login-btn');
        const logoutBtn = document.getElementById('supabase-logout-btn');
        if (panel) panel.hidden = false;
        if (userEl) {
            userEl.textContent = location.protocol === 'file:'
                ? 'ローカルサーバーで開く必要があります'
                : 'Supabase未接続';
        }
        setAuthButtonVisibility(loginBtn, logoutBtn, false);
        if (loginBtn) {
            setButtonContent(
                loginBtn,
                location.protocol === 'file:' ? 'localhostで開く' : '設定を確認'
            );
        }
        showError(location.protocol === 'file:'
            ? 'Googleサインインは file:// では開始できません。ローカルサーバーで開いてください。'
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
        showError('Googleサインイン状態を確認できませんでした: ' + e.message);
    }
}

document.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' && currentTab === 'create') createProject();
});

// #create の付け外しでモードを切り替える(戻る操作も保つ)
window.addEventListener('hashchange', () => {
    setTab(tabFromLocation());
});

document.addEventListener('DOMContentLoaded', () => {
    setupIndexEvents();
    initSupabaseAuth();
});
