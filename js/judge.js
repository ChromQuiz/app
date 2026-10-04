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
    badge.textContent = role === 'admin' ? '管理者' : '採点者';
    roleEl.appendChild(badge);
}

function setStatus(statusEl, className, iconClass, text) {
    statusEl.className = `q-status ${className}`;
    statusEl.textContent = '';
    const icon = createIcon(iconClass);
    statusEl.append(icon, ` ${text}`);
}

function getQuestionGridColumns() {
    const grid = document.getElementById('q-grid');
    if (!grid) return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
}

function focusQuestionCard(index) {
    const cards = Array.from(document.querySelectorAll('.q-card'));
    if (index < 0 || index >= cards.length) return;
    cards.forEach((card, cardIndex) => { card.tabIndex = cardIndex === index ? 0 : -1; });
    cards[index].focus({ preventScroll: true });
    cards[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function handleQuestionCardKeydown(event, index, questionNumber) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enterQ(questionNumber);
        return;
    }
    const columns = getQuestionGridColumns();
    const offsets = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: columns,
        ArrowUp: -columns,
    };
    if (offsets[event.key] == null) return;
    event.preventDefault();
    focusQuestionCard(index + offsets[event.key]);
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
    document.getElementById('judge-resume-btn')?.addEventListener('click', (event) => {
        const q = Number(event.currentTarget.dataset.resumeQ || 0);
        if (q > 0) enterQ(q);
    });
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
        document.getElementById('admin-menu-home')?.classList.remove('u-hidden');
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
        card.setAttribute('role', 'gridcell');
        card.tabIndex = i === 1 ? 0 : -1;
        const qNum = document.createElement('div');
        qNum.className = 'q-num';
        qNum.textContent = `${i}問`;
        const status = document.createElement('div');
        status.className = 'q-status status-open';
        status.id = `qstatus-${i}`;
        status.textContent = '未着手';
        card.append(qNum, status);
        card.addEventListener('click', () => enterQ(i));
        card.addEventListener('focus', () => {
            document.querySelectorAll('.q-card').forEach((item) => { item.tabIndex = item === card ? 0 : -1; });
        });
        card.addEventListener('keydown', (event) => handleQuestionCardKeydown(event, i - 1, i));
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

function updateGrid(rows) {
    // 「次の一手」計算用
    let availableQ = 0;       // 入れる問題のうち最小問題番号
    let mineResumeQ = 0;      // 自分が担当していて未完了の最小問題番号
    let hasAnyMine = false;
    let openCount = 0;
    let inprogressCount = 0;
    let doneCount = 0;

    for (let q = 1; q <= totalQuestions; q++) {
        const qRows = rows.filter(row => Number(row.question_number) === q);
        const scorerIds = qRows.map(row => row.scorer_member_id);
        const completedIds = qRows.filter(row => row.completed_at).map(row => row.scorer_member_id);
        const isMine = currentMemberId && scorerIds.includes(currentMemberId);
        const myDone = isMine && completedIds.includes(currentMemberId);
        const isFull = scorerIds.length >= requiredScorers && !isMine;
        const allDone = scorerIds.length >= requiredScorers && completedIds.length >= requiredScorers;

        if (isMine) hasAnyMine = true;
        if (isMine && !myDone && !allDone && !mineResumeQ) mineResumeQ = q;
        if (!allDone && (!isFull || isMine) && !(isMine && myDone) && !availableQ) availableQ = q;
        if (allDone) doneCount++;
        else if (scorerIds.length > 0) inprogressCount++;
        else openCount++;

        const card = document.getElementById(`qcard-${q}`);
        const statusEl = document.getElementById(`qstatus-${q}`);
        if (!card || !statusEl) continue;

        card.className = 'q-card';
        if (isMine) card.classList.add('mine');
        if (isMine && !myDone && !allDone) card.classList.add('mine-active');
        if (isFull) card.classList.add('locked');
        if (allDone) card.classList.add('done');
        else if (scorerIds.length > 0) card.classList.add('inprogress');
        card.setAttribute('aria-disabled', isFull ? 'true' : 'false');

        if (allDone) {
            setStatus(statusEl, 'status-done', 'circle-check', '完了');
        } else if (scorerIds.length > 0) {
            setStatus(statusEl, 'status-inprogress', 'pen', `採点中 ${scorerIds.length}/${requiredScorers}`);
        } else {
            setStatus(statusEl, 'status-open', 'minus', '未着手');
        }
        card.setAttribute('aria-label', `${q}問、${statusEl.textContent.trim()}`);
    }

    updateResumeHero(mineResumeQ || availableQ, mineResumeQ, hasAnyMine);
    updateJudgeSummary({ openCount, inprogressCount, doneCount });
    renderSlotPanel(rows);
}

// ---- 採点中の枠の解放 ----
// 途中でやめた人がいても、その問題の枠は占有されたままで、他の人が入れず、確定も進まない。
// メンバーなら誰でも、まだ完了していない枠(自分の枠も他の人の枠も)を解放できる。
let slotPanelSignature = '';
let slotPanelOpenedOnce = false;

function slotOwnerLabel(memberId) {
    if (memberId && memberId === currentMemberId) return 'あなた';
    return memberNameMap[memberId] || '採点者';
}

function renderSlotPanel(rows) {
    const panel = document.getElementById('slot-panel');
    const list = document.getElementById('slot-list');
    const summary = document.getElementById('slot-panel-summary');
    if (!panel || !list || !summary) return;

    const openSlots = (rows || [])
        .filter(row => !row.completed_at)
        .sort((a, b) => Number(a.question_number) - Number(b.question_number)
            || String(a.scorer_member_id).localeCompare(String(b.scorer_member_id)));

    // 3秒ごとの更新で、押そうとしているボタンが作り直されないよう、内容が変わったときだけ描き直す
    const signature = openSlots.map(row => `${row.question_number}:${row.scorer_member_id}`).join(',');
    if (signature === slotPanelSignature) return;
    slotPanelSignature = signature;

    if (!openSlots.length) {
        panel.classList.add('u-hidden');
        list.textContent = '';
        return;
    }
    panel.classList.remove('u-hidden');
    summary.textContent = `採点中の枠 ${openSlots.length}件`;
    // 少ないときは最初から開いておく。そのあと、開閉は利用者の操作に任せる
    if (!slotPanelOpenedOnce) {
        panel.open = openSlots.length <= 6;
        slotPanelOpenedOnce = true;
    }

    list.textContent = '';
    openSlots.forEach((row) => {
        const li = document.createElement('li');
        li.className = 'slot-row';
        const text = document.createElement('span');
        text.className = 'slot-row-text';
        text.textContent = `第${row.question_number}問 · ${slotOwnerLabel(row.scorer_member_id)}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn secondary slot-release-btn';
        button.textContent = '枠を解放';
        button.addEventListener('click', () => releaseSlot(row, button));
        li.append(text, button);
        list.appendChild(li);
    });
}

async function releaseSlot(row, button) {
    const q = Number(row.question_number);
    const owner = slotOwnerLabel(row.scorer_member_id);
    const subject = owner === 'あなた' ? 'あなた' : `${owner}さん`;
    const ok = await showConfirm(
        `第${q}問の、${subject}の枠を解放します。${subject}のこの問題での判定は、すべて消えます。よろしいですか？`,
        '解放する',
    );
    if (!ok) return;
    button.disabled = true;
    try {
        await CIQSupabaseAPI.releaseQuestionScorer(projectId, q, row.scorer_member_id);
        showToast(`第${q}問の枠を解放しました。`, 'success');
        slotPanelSignature = '';   // 次の更新で必ず描き直す
        await refreshGrid();
    } catch (e) {
        button.disabled = false;
        showToast(e.message || '枠を解放できませんでした。時間をおいて再度お試しください。', 'error');
        slotPanelSignature = '';
        refreshGrid();
    }
}

// 「続きから採点する」ヒーロー — 入れる最若番の問題へ常に案内する
function updateResumeHero(resumeQ, mineResumeQ = 0, hasAnyMine = false) {
    const hero = document.getElementById('judge-resume');
    const desc = document.getElementById('judge-resume-desc');
    const btn = document.getElementById('judge-resume-btn');
    if (!hero || !desc || !btn) return;
    if (resumeQ > 0) {
        desc.textContent = mineResumeQ === resumeQ
            ? `第${resumeQ}問の採点が途中です`
            : `入れる問題のうち最も若い第${resumeQ}問へ進みます`;
        btn.dataset.resumeQ = String(resumeQ);
        btn.disabled = false;
        btn.textContent = '';
        btn.append(hasAnyMine ? '採点を再開 ' : '採点を開始 ', createIcon('arrow-right'));
        hero.classList.remove('u-hidden');
    } else {
        desc.textContent = '現在入れる問題はありません';
        delete btn.dataset.resumeQ;
        btn.disabled = true;
        btn.textContent = '採点できる問題なし';
        hero.classList.remove('u-hidden');
    }
}

function updateJudgeSummary({ openCount, inprogressCount, doneCount }) {
    const summary = document.getElementById('judge-summary');
    if (!summary) return;
    summary.textContent =
        `未着手 ${openCount} · 採点中 ${inprogressCount} · 完了 ${doneCount}`;
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
    showToast(error.message || '問題一覧を読み込めませんでした。', 'error');
});
