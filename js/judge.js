// judge.js - 問題一覧（Supabase）

const auth = requireAuth();
const { projectId, scorerName, scorerRole } = auth || {};
if (!auth) throw new Error('auth');

let totalQuestions = 100;
let requiredScorers = 3;
let currentMemberId = '';
let memberNameMap = {};

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
    document.getElementById('menu-scorer-role').innerHTML = scorerRole === 'admin'
        ? '<span class="menu-role-badge admin"><i class="fa-solid fa-crown"></i> 管理者</span>'
        : '<span class="menu-role-badge scorer"><i class="fa-solid fa-user-check"></i> 採点者</span>';

    if (scorerRole === 'admin') {
        document.getElementById('admin-menu-section').style.display = 'block';
    }

    renderQuestionCards();
    await refreshGrid();
    setInterval(refreshGrid, 3000);
}

function renderQuestionCards() {
    const qGrid = document.getElementById('q-grid');
    qGrid.innerHTML = '';
    for (let i = 1; i <= totalQuestions; i++) {
        const card = document.createElement('div');
        card.className = 'q-card';
        card.id = `qcard-${i}`;
        card.innerHTML = `
            <div class="q-num">${i}問</div>
            <div class="q-scorers" id="qscorers-${i}"></div>
            <div class="q-status status-open" id="qstatus-${i}">未着手</div>
        `;
        card.onclick = () => enterQ(i);
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

        scorersEl.innerHTML = scorerIds.map((memberId, idx) => {
            const done = completedIds.includes(memberId);
            return `${done ? '✓' : '…'} ${escapeHtml(scorerLabel(memberId, idx))}`;
        }).join('<br>');

        if (isFull && !isMine) {
            statusEl.className = 'q-status status-locked';
            statusEl.innerHTML = '<i class="fa-solid fa-ban"></i> 満員';
        } else if (allDone) {
            statusEl.className = 'q-status status-done';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> 完了';
        } else if (scorerIds.length > 0) {
            statusEl.className = 'q-status status-inprogress';
            statusEl.innerHTML = `<i class="fa-solid fa-pen"></i> 採点中 ${scorerIds.length}/${requiredScorers}`;
        } else {
            statusEl.className = 'q-status status-open';
            statusEl.innerHTML = '<i class="fa-solid fa-minus"></i> 未着手';
        }
    }
}

function enterQ(q) {
    const card = document.getElementById(`qcard-${q}`);
    if (card?.classList.contains('locked')) return;
    localStorage.setItem('current_q', q);
    location.href = 'question.html';
}

initializeApp().catch(error => {
    console.error(error);
    showToast(error.message || '問題一覧を読み込めませんでした', 'error');
});
