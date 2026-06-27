// conflict.js - 要確認（Supabase）

const auth = requireAuth({ requireAdmin: true });
if (!auth) throw new Error('auth');
const { projectId } = auth;

let project = null;
let answerPages = [];
let modelAnswers = {};
let scoreVotes = [];
let finalResults = [];
let questionScorers = [];
let currentConflicts = [];
let selectedIndex = 0;
let cellUrlCache = {};

async function init() {
    try {
        await refreshData();
        setInterval(refreshData, 5000);
    } catch (e) {
        const grid = document.getElementById('conflict-grid');
        grid.innerHTML = `<div class="loading-state" style="grid-column:1/-1"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(e.message)}</div>`;
        const counter = document.getElementById('counter');
        counter.textContent = '読み込み失敗';
        counter.className = 'counter has-conflicts';
    }
}

async function refreshData() {
    const [
        projectRow,
        pages,
        modelRows,
        votes,
        finals,
        scorers,
    ] = await Promise.all([
        project ? Promise.resolve(project) : CIQSupabaseAPI.getProject(projectId),
        CIQSupabaseAPI.listAnswerPages(projectId),
        CIQSupabaseAPI.listModelAnswers(projectId),
        CIQSupabaseAPI.listScoreVotes(projectId),
        CIQSupabaseAPI.listFinalResults(projectId),
        CIQSupabaseAPI.listQuestionScorers(projectId),
    ]);

    project = projectRow;
    answerPages = pages;
    scoreVotes = votes;
    finalResults = finals;
    questionScorers = scorers;
    modelAnswers = {};
    for (const row of modelRows) modelAnswers[row.question_number] = row.answer;

    render();
}

function getEntryMeta(page) {
    const entry = page.entries || {};
    const entryNumber = Number(entry.entry_number || 0);
    return {
        entryId: page.entry_id,
        entryNumber,
        displayName: entry.entry_name || `No.${String(entryNumber).padStart(3, '0')}`,
        affiliation: entry.affiliation || '',
        grade: entry.grade || '',
    };
}

function buildConflicts() {
    const conflicts = [];
    const required = Number(project?.required_scorers || 3);
    const totalQuestions = Number(project?.question_count || 100);
    const completedByQuestion = new Map();

    for (const scorer of questionScorers) {
        if (!scorer.completed_at) continue;
        const q = Number(scorer.question_number);
        completedByQuestion.set(q, (completedByQuestion.get(q) || 0) + 1);
    }

    for (let q = 1; q <= totalQuestions; q++) {
        if ((completedByQuestion.get(q) || 0) < required) continue;

        for (const page of answerPages) {
            const meta = getEntryMeta(page);
            if (!meta.entryId || !meta.entryNumber) continue;

            const votes = scoreVotes.filter(row => Number(row.question_number) === q && row.entry_id === meta.entryId);
            const corrects = votes.filter(row => row.result === 'correct').length;
            const wrongs = votes.filter(row => row.result === 'wrong').length;
            const finalResult = finalResults.find(row => Number(row.question_number) === q && row.entry_id === meta.entryId);

            if (corrects >= required || wrongs >= required) continue;
            conflicts.push({
                q,
                ...meta,
                votes,
                finalResult: finalResult?.result || null,
            });
        }
    }

    return conflicts.sort((a, b) => a.q - b.q || a.entryNumber - b.entryNumber);
}

function render() {
    currentConflicts = buildConflicts();
    if (selectedIndex >= currentConflicts.length) selectedIndex = Math.max(0, currentConflicts.length - 1);

    const unresolvedCount = currentConflicts.filter(c => !c.finalResult).length;
    const counter = document.getElementById('counter');
    if (currentConflicts.length === 0 || unresolvedCount === 0) {
        counter.textContent = `全${currentConflicts.length}件 確定済み`;
        counter.className = 'counter all-clear';
    } else {
        counter.textContent = `残 ${unresolvedCount} / ${currentConflicts.length}件`;
        counter.className = 'counter has-conflicts';
    }

    const grid = document.getElementById('conflict-grid');
    if (currentConflicts.length === 0) {
        grid.innerHTML = '<div class="no-conflict"><i class="fa-solid fa-circle-check" style="font-size:48px;display:block;margin-bottom:16px;color:var(--success)"></i> 要確認はありません</div>';
        return;
    }

    grid.innerHTML = '';
    currentConflicts.forEach((conflict, idx) => {
        const card = document.createElement('div');
        card.className = `conflict-card ${conflict.finalResult ? 'resolved ' + conflict.finalResult : ''} ${idx === selectedIndex ? 'selected' : ''}`;
        card.innerHTML = cardHtml(conflict);
        card.addEventListener('click', () => selectConflictCard(idx));
        card.addEventListener('dblclick', () => showPreview(projectId, null, conflict.entryNumber));
        grid.appendChild(card);
        ensureCellUrl(conflict);
    });

    scrollToSelectedConflict();
}

function cardHtml(conflict) {
    const cacheKey = `${conflict.entryNumber}:q${conflict.q}`;
    const cellUrl = cellUrlCache[cacheKey];
    const votesHtml = conflict.votes.map(vote => {
        if (vote.result === 'correct') return '<span class="vote-dot correct">○</span>';
        if (vote.result === 'wrong') return '<span class="vote-dot wrong">×</span>';
        if (vote.result === 'hold') return '<span class="vote-dot hold">△</span>';
        return '';
    }).join(' ');
    const imageHtml = cellUrl
        ? `<img src="${cellUrl}" alt="${escapeHtml(conflict.displayName)} ${conflict.q}問" loading="eager" decoding="async" />`
        : '<div class="img-expired"><i class="fa-solid fa-clock"></i> 画像を読み込み中</div>';
    const modelAnswer = modelAnswers[conflict.q] || '';

    return `
        ${imageHtml}
        <div class="q-tag-badge">${conflict.q}問</div>
        <div class="entry-num">${escapeHtml(conflict.displayName)}</div>
        ${modelAnswer ? `<div class="conflict-model-ans"><strong>${escapeHtml(modelAnswer)}</strong></div>` : ''}
        <div class="votes-mini">${votesHtml}</div>
    `;
}

async function ensureCellUrl(conflict) {
    const cacheKey = `${conflict.entryNumber}:q${conflict.q}`;
    if (cellUrlCache[cacheKey] !== undefined) return;
    cellUrlCache[cacheKey] = null;
    try {
        cellUrlCache[cacheKey] = await CIQSupabaseAPI.getAnswerCellUrl(projectId, conflict.entryNumber, conflict.q);
    } catch (_) {
        cellUrlCache[cacheKey] = '';
    }
    render();
}

async function setFinal(q, entryId, result) {
    await CIQSupabaseAPI.resolveScoreConflict(projectId, q, entryId, result);
    await refreshData();
}

function selectConflictCard(idx) {
    if (idx < 0 || idx >= currentConflicts.length) return;
    selectedIndex = idx;
    const cards = document.querySelectorAll('.conflict-card');
    cards.forEach((card, i) => card.classList.toggle('selected', i === selectedIndex));
    scrollToSelectedConflict();
}

function advanceConflictSelection() {
    if (selectedIndex < currentConflicts.length - 1) {
        selectConflictCard(selectedIndex + 1);
    }
}

function getConflictGridCols() {
    const grid = document.getElementById('conflict-grid');
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
}

function scrollToSelectedConflict() {
    const cards = document.querySelectorAll('.conflict-card');
    if (cards[selectedIndex]) {
        cards[selectedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

document.addEventListener('keydown', (e) => {
    if (currentConflicts.length === 0) return;
    const key = e.key;
    if (key === 'm' || key === 'M') {
        e.preventDefault();
        const conflict = currentConflicts[selectedIndex];
        if (conflict) {
            setFinal(conflict.q, conflict.entryId, 'correct').then(advanceConflictSelection).catch(err => showToast(err.message, 'error'));
        }
    } else if (key === 'x' || key === 'X') {
        e.preventDefault();
        const conflict = currentConflicts[selectedIndex];
        if (conflict) {
            setFinal(conflict.q, conflict.entryId, 'wrong').then(advanceConflictSelection).catch(err => showToast(err.message, 'error'));
        }
    } else if (key === 'ArrowRight') {
        e.preventDefault();
        selectConflictCard(selectedIndex + 1);
    } else if (key === 'ArrowLeft') {
        e.preventDefault();
        selectConflictCard(selectedIndex - 1);
    } else if (key === 'ArrowDown') {
        e.preventDefault();
        selectConflictCard(selectedIndex + getConflictGridCols());
    } else if (key === 'ArrowUp') {
        e.preventDefault();
        selectConflictCard(selectedIndex - getConflictGridCols());
    }
});

init();
