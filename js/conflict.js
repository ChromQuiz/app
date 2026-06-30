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
let cellUrlPreloadKey = '';

async function runLimited(items, limit, task) {
    const results = [];
    for (let i = 0; i < items.length; i += limit) {
        const batch = items.slice(i, i + limit);
        results.push(...await Promise.all(batch.map(task)));
    }
    return results;
}

function setConflictGridMessage(message, options = {}) {
    const grid = document.getElementById('conflict-grid');
    grid.textContent = '';
    const messageEl = document.createElement('div');
    messageEl.className = options.className || 'loading-state';
    if (options.icon) {
        const icon = document.createElement('i');
        icon.className = options.icon;
        if (options.iconSize) {
            icon.classList.add('message-icon-large');
        }
        if (options.iconColor === 'var(--success)') icon.classList.add('message-icon-success');
        messageEl.append(icon, ' ');
    }
    messageEl.appendChild(document.createTextNode(message));
    grid.appendChild(messageEl);
}

async function init() {
    try {
        await refreshData();
        setInterval(refreshData, 5000);
    } catch (e) {
        setConflictGridMessage(e.message || '要確認データを読み込めませんでした', { icon: 'fa-solid fa-triangle-exclamation' });
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

    await render();
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
        storagePath: page.storage_path || '',
        cellRegions: page.cells?.regions || {},
        pageWidth: Number(page.cells?.pageWidth || 0) || null,
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

function getMissingConflictImageRequests(conflicts) {
    return conflicts
        .map(conflict => ({
            key: `${conflict.entryNumber}:q${conflict.q}`,
            entryNumber: conflict.entryNumber,
            questionNumber: conflict.q,
            storagePath: conflict.storagePath,
            cellRegion: conflict.cellRegions?.[`q${conflict.q}`] || null,
            pageWidth: conflict.pageWidth,
        }))
        .filter(request => cellUrlCache[request.key] === undefined);
}

async function render() {
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
        setConflictGridMessage('要確認はありません', {
            className: 'no-conflict',
            icon: 'fa-solid fa-circle-check',
            iconSize: '48px',
            iconColor: 'var(--success)',
        });
        return;
    }

    const missingImages = getMissingConflictImageRequests(currentConflicts);
    if (missingImages.length) {
        setConflictGridMessage('画像を準備中...', { icon: 'fa-solid fa-spinner fa-spin' });
        await ensureConflictCellUrls(missingImages);
        await render();
        return;
    }

    grid.textContent = '';
    currentConflicts.forEach((conflict, idx) => {
        const card = createConflictCard(conflict, idx);
        card.addEventListener('click', () => selectConflictCard(idx));
        card.addEventListener('dblclick', () => showPreview(projectId, null, conflict.entryNumber));
        grid.appendChild(card);
    });

    scrollToSelectedConflict();
}

function createVoteDot(result) {
    const dot = document.createElement('span');
    if (result === 'correct') {
        dot.className = 'vote-dot correct';
        dot.textContent = '○';
    } else if (result === 'wrong') {
        dot.className = 'vote-dot wrong';
        dot.textContent = '×';
    } else if (result === 'hold') {
        dot.className = 'vote-dot hold';
        dot.textContent = '△';
    }
    return dot;
}

function createConflictCard(conflict, idx) {
    const cacheKey = `${conflict.entryNumber}:q${conflict.q}`;
    const hasTriedImage = Object.prototype.hasOwnProperty.call(cellUrlCache, cacheKey);
    const cellUrl = cellUrlCache[cacheKey];
    const modelAnswer = modelAnswers[conflict.q] || '';

    const card = document.createElement('div');
    card.className = `conflict-card ${conflict.finalResult ? 'resolved ' + conflict.finalResult : ''} ${idx === selectedIndex ? 'selected' : ''}`;
    if (cellUrl) {
        const image = document.createElement('img');
        image.src = cellUrl;
        image.alt = `${conflict.displayName} ${conflict.q}問`;
        image.loading = idx < 12 ? 'eager' : 'lazy';
        image.decoding = 'async';
        if (idx < 12) image.fetchPriority = 'high';
        card.appendChild(image);
    } else {
        const expired = document.createElement('div');
        expired.className = 'img-expired';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-clock';
        expired.append(icon, hasTriedImage ? ' 画像がありません' : ' 画像を読み込み中');
        card.appendChild(expired);
    }

    const qTag = document.createElement('div');
    qTag.className = 'q-tag-badge';
    qTag.textContent = `${conflict.q}問`;
    const entryNum = document.createElement('div');
    entryNum.className = 'entry-num';
    entryNum.textContent = conflict.displayName;
    card.append(qTag, entryNum);

    if (modelAnswer) {
        const model = document.createElement('div');
        model.className = 'conflict-model-ans';
        const strong = document.createElement('strong');
        strong.textContent = modelAnswer;
        model.appendChild(strong);
        card.appendChild(model);
    }

    const votes = document.createElement('div');
    votes.className = 'votes-mini';
    conflict.votes.forEach((vote, index) => {
        const dot = createVoteDot(vote.result);
        if (!dot.textContent) return;
        if (index > 0 && votes.childNodes.length) votes.appendChild(document.createTextNode(' '));
        votes.appendChild(dot);
    });
    card.appendChild(votes);
    return card;
}

async function ensureConflictCellUrls(missing) {
    if (!missing.length) return;

    const preloadKey = missing.map(request => request.key).sort().join('|');
    if (preloadKey === cellUrlPreloadKey) return;
    cellUrlPreloadKey = preloadKey;
    for (const request of missing) cellUrlCache[request.key] = null;

    try {
        const fallbackRequests = missing.filter(request => request.storagePath && request.cellRegion);
        const pageUrls = await CIQSupabaseAPI.getAnswerPageUrls(projectId, fallbackRequests.map(request => ({
            key: request.key,
            storagePath: request.storagePath,
        }))).catch(() => ({}));
        await runLimited(fallbackRequests, 8, async (request) => {
            const pageUrl = pageUrls[request.key];
            if (!pageUrl) {
                cellUrlCache[request.key] = '';
                return;
            }
            cellUrlCache[request.key] = await CIQSupabaseAPI.cropImageRegion(pageUrl, request.cellRegion, request.pageWidth);
        });
    } catch (_) {
        for (const request of missing) cellUrlCache[request.key] = '';
    }
    cellUrlPreloadKey = '';
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

document.getElementById('conflict-back-btn')?.addEventListener('click', () => {
    location.href = 'judge.html';
});

init();
