// judge.js - 問題一覧（Supabase）

const auth = requireAuth();
const { projectId, scorerName, scorerRole } = auth || {};
if (!auth) throw new Error('auth');

let totalQuestions = 100;
let requiredScorers = 3;
let currentMemberId = '';
let memberNameMap = {};

function setRoleBadge(role) {
    const roleEl = document.getElementById('menu-scorer-role');
    roleEl.textContent = '';
    const badge = document.createElement('span');
    badge.className = role === 'admin' ? 'menu-role-badge admin' : 'menu-role-badge scorer';
    const icon = document.createElement('i');
    icon.className = role === 'admin' ? 'fa-solid fa-crown' : 'fa-solid fa-user-check';
    badge.append(icon, role === 'admin' ? ' 管理者' : ' 採点者');
    roleEl.appendChild(badge);
}

function setStatus(statusEl, className, iconClass, text) {
    statusEl.className = `q-status ${className}`;
    statusEl.textContent = '';
    const icon = document.createElement('i');
    icon.className = iconClass;
    statusEl.append(icon, ` ${text}`);
}

function setupJudgeEvents() {
    document.querySelectorAll('[data-toggle-menu]').forEach((el) => {
        el.addEventListener('click', toggleMenu);
    });
    document.querySelectorAll('[data-nav-target]').forEach((el) => {
        el.addEventListener('click', () => {
            location.href = el.dataset.navTarget;
        });
    });
    document.querySelectorAll('[data-open-page]').forEach((el) => {
        el.addEventListener('click', () => {
            window.open(`${el.dataset.openPage}?pid=${encodeURIComponent(projectId)}`, '_blank');
        });
    });
    document.querySelectorAll('[data-open-static]').forEach((el) => {
        el.addEventListener('click', () => window.open(el.dataset.openStatic, '_blank'));
    });
    document.getElementById('judge-logout-btn')?.addEventListener('click', logout);
}

async function initializeApp() {
    const sessionData = await CIQSupabaseAPI.getSession();
    if (!sessionData?.user) {
        showToast('Googleログインが必要です。', 'error');
        setTimeout(() => location.href = 'index.html', 1200);
        return;
    }

    const project = await CIQSupabaseAPI.getProject(projectId);
    totalQuestions = project.question_count || 100;
    requiredScorers = project.required_scorers || 3;
    document.getElementById('project-title').textContent = project.name || '問題一覧';

    const members = await CIQSupabaseAPI.listProjectMembers(projectId).catch(() => []);
    memberNameMap = Object.fromEntries((members || []).map(member => [member.id, member.display_name || '採点者']));
    const ownMember = members.find(member => member.user_id === sessionData.user.id);
    currentMemberId = ownMember?.id || '';

    document.getElementById('menu-scorer-name').textContent = scorerName;
    setRoleBadge(scorerRole);

    if (scorerRole === 'admin') {
        document.getElementById('admin-menu-section').style.display = 'block';
    }

    renderQuestionCards();
    await refreshGrid();
    setInterval(refreshGrid, 3000);
}

function renderQuestionCards() {
    const qGrid = document.getElementById('q-grid');
    qGrid.textContent = '';
    for (let i = 1; i <= totalQuestions; i++) {
        const card = document.createElement('div');
        card.className = 'q-card';
        card.id = `qcard-${i}`;
        const qNum = document.createElement('div');
        qNum.className = 'q-num';
        qNum.textContent = `${i}問`;
        const scorers = document.createElement('div');
        scorers.className = 'q-scorers';
        scorers.id = `qscorers-${i}`;
        const status = document.createElement('div');
        status.className = 'q-status status-open';
        status.id = `qstatus-${i}`;
        status.textContent = '未着手';
        card.append(qNum, scorers, status);
        card.addEventListener('click', () => enterQ(i));
        qGrid.appendChild(card);
    }
}

async function refreshGrid() {
    try {
        const scorers = await CIQSupabaseAPI.listQuestionScorers(projectId);
        updateGrid(scorers || []);
    } catch (e) {
        console.warn('採点状況の更新に失敗:', e);
    }
}

function scorerLabel(memberId, index) {
    return memberNameMap[memberId] || `採点者${index + 1}`;
}

function updateGrid(rows) {
    for (let q = 1; q <= totalQuestions; q++) {
        const qRows = rows.filter(row => Number(row.question_number) === q);
        const scorerIds = qRows.map(row => row.scorer_member_id);
        const completedIds = qRows.filter(row => row.completed_at).map(row => row.scorer_member_id);
        const isMine = currentMemberId && scorerIds.includes(currentMemberId);
        const isFull = scorerIds.length >= requiredScorers && !isMine;
        const allDone = scorerIds.length >= requiredScorers && completedIds.length >= requiredScorers;

        const card = document.getElementById(`qcard-${q}`);
        const statusEl = document.getElementById(`qstatus-${q}`);
        const scorersEl = document.getElementById(`qscorers-${q}`);
        if (!card || !statusEl || !scorersEl) continue;

        card.className = 'q-card';
        if (isMine) card.classList.add('mine');
        if (isFull) card.classList.add('locked');
        if (allDone) card.classList.add('done');
        else if (scorerIds.length > 0) card.classList.add('inprogress');

        scorersEl.textContent = '';
        scorerIds.forEach((memberId, idx) => {
            const done = completedIds.includes(memberId);
            if (idx > 0) scorersEl.appendChild(document.createElement('br'));
            scorersEl.appendChild(document.createTextNode(`${done ? '✓' : '…'} ${scorerLabel(memberId, idx)}`));
        });

        if (isFull && !isMine) {
            setStatus(statusEl, 'status-locked', 'fa-solid fa-ban', '満員');
        } else if (allDone) {
            setStatus(statusEl, 'status-done', 'fa-solid fa-circle-check', '完了');
        } else if (scorerIds.length > 0) {
            setStatus(statusEl, 'status-inprogress', 'fa-solid fa-pen', `採点中 ${scorerIds.length}/${requiredScorers}`);
        } else {
            setStatus(statusEl, 'status-open', 'fa-solid fa-minus', '未着手');
        }
    }
}

function enterQ(q) {
    const card = document.getElementById(`qcard-${q}`);
    if (card?.classList.contains('locked')) return;
    localStorage.setItem('current_q', q);
    location.href = 'question.html';
}

setupJudgeEvents();
initializeApp().catch(error => {
    console.error(error);
    showToast(error.message || '問題一覧を読み込めませんでした', 'error');
});
