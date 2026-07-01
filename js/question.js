// question.js - 採点画面（Supabase）

const auth = requireAuth();
const { projectId } = auth || {};
if (!auth) throw new Error('auth');

const currentQ = parseInt(localStorage.getItem('current_q') || '1', 10);
let currentMemberId = '';
let answerCards = [];
let myScores = {};
let selectedIndex = 0;
let isCompleted = false;
let pendingWrites = {};
let fallbackImageObserver = null;
let fallbackImageFlushTimer = null;
const fallbackImageQueue = new Map();
const INITIAL_IMAGE_PREWARM_LIMIT = 24;
const IMAGE_CROP_CONCURRENCY = 12;
const BACKGROUND_PREWARM_BATCH = 24;
let backgroundPrewarmToken = 0;

document.getElementById('q-badge').textContent = `${currentQ} 問`;

async function runLimited(items, limit, task) {
    const results = [];
    for (let i = 0; i < items.length; i += limit) {
        const batch = items.slice(i, i + limit);
        results.push(...await Promise.all(batch.map(task)));
    }
    return results;
}

function logPerf(label, details = {}) {
    console.info('[CIQ perf]', label, details);
}

function runWhenIdle(task, timeout = 2500) {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(task, { timeout });
    } else {
        setTimeout(task, 250);
    }
}

function setAnswerGridMessage(message, iconClass = '') {
    const grid = document.getElementById('answer-grid');
    grid.textContent = '';
    const messageEl = document.createElement('div');
    messageEl.className = 'loading-state';
    if (iconClass) {
        const icon = document.createElement('i');
        icon.className = iconClass;
        messageEl.append(icon, ' ');
    }
    messageEl.appendChild(document.createTextNode(message));
    grid.appendChild(messageEl);
}

function updateAnswerCardClass(card, result, isSelected) {
    card.className = `answer-card ${result === 'correct' ? 'correct' : result === 'wrong' ? 'wrong' : result === 'hold' ? 'hold' : ''} ${isSelected ? 'selected' : ''}`;
}

function createAnswerCard(cardData, idx) {
    const myScore = myScores[cardData.entryId];
    const card = document.createElement('div');
    updateAnswerCardClass(card, myScore, idx === selectedIndex);
    card.setAttribute('aria-label', `${cardData.displayName} の答案`);
    card.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    if (cardData.cellUrl || (cardData.pageUrl && cardData.cellRegion) || (cardData.storagePath && cardData.cellRegion)) {
        const image = document.createElement('img');
        image.alt = cardData.displayName;
        image.loading = idx < 16 ? 'eager' : 'lazy';
        image.decoding = 'async';
        if (idx < 16) image.fetchPriority = 'high';
        if (cardData.cellUrl) {
            image.src = cardData.cellUrl;
        } else {
            image.classList.add('is-loading');
            image.dataset.fallbackPending = 'true';
        }
        card.appendChild(image);
        if (!cardData.cellUrl) observeFallbackImage(card, image, cardData);
    } else {
        const expired = document.createElement('div');
        expired.className = 'img-expired';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-clock';
        expired.append(icon, ' 画像がありません');
        card.appendChild(expired);
    }

    const entryNum = document.createElement('div');
    entryNum.className = 'entry-num';
    entryNum.textContent = cardData.displayName;
    card.appendChild(entryNum);
    card.addEventListener('click', () => selectCard(idx));
    card.addEventListener('dblclick', () => showPreview(projectId, null, cardData.entryNumber));
    return card;
}

function observeFallbackImage(card, image, cardData) {
    if (!fallbackImageObserver && 'IntersectionObserver' in window) {
        fallbackImageObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                fallbackImageObserver.unobserve(entry.target);
                const target = entry.target;
                queueFallbackImage(target._ciqImage, target._ciqCardData, target);
            });
        }, { rootMargin: '240px 0px' });
    }
    card._ciqImage = image;
    card._ciqCardData = cardData;
    if (fallbackImageObserver) {
        fallbackImageObserver.observe(card);
    } else {
        queueFallbackImage(image, cardData, card);
    }
}

function queueFallbackImage(image, cardData, card) {
    if (!image || image.dataset.fallbackPending !== 'true') return;
    fallbackImageQueue.set(String(cardData.entryId), { image, cardData, card });
    if (fallbackImageFlushTimer) return;
    fallbackImageFlushTimer = setTimeout(flushFallbackImages, 40);
}

async function flushFallbackImages() {
    fallbackImageFlushTimer = null;
    const batch = Array.from(fallbackImageQueue.values());
    fallbackImageQueue.clear();
    if (!batch.length) return;

    const cellUrls = await CIQSupabaseAPI.getAnswerCellUrls(projectId, batch.map(item => ({
        key: String(item.cardData.entryId),
        entryNumber: item.cardData.entryNumber,
        questionNumber: currentQ,
    }))).catch(() => ({}));
    const directResults = [];
    const cropBatch = [];
    batch.forEach((item) => {
        const cellUrl = cellUrls[String(item.cardData.entryId)] || '';
        if (cellUrl) {
            item.image.dataset.fallbackPending = 'loading';
            directResults.push({ image: item.image, card: item.card, cellUrl });
            return;
        }
        cropBatch.push(item);
    });

    const needsPageUrl = cropBatch
        .filter(item => !item.cardData.pageUrl && item.cardData.storagePath)
        .map(item => ({
            key: String(item.cardData.entryId),
            storagePath: item.cardData.storagePath,
        }));
    const pageUrls = await CIQSupabaseAPI.getAnswerPageUrls(projectId, needsPageUrl).catch(() => ({}));
    cropBatch.forEach((item) => {
        item.cardData.pageUrl = item.cardData.pageUrl || pageUrls[String(item.cardData.entryId)] || '';
    });
    const cropResults = await runLimited(cropBatch, IMAGE_CROP_CONCURRENCY, ({ image, cardData, card }) => resolveFallbackImage(image, cardData, card));
    await Promise.all([...directResults, ...cropResults].map(applyFallbackImageResult));
}

async function resolveFallbackImage(image, cardData, card) {
    if (!image || image.dataset.fallbackPending !== 'true') return { image, card, cellUrl: '' };
    image.dataset.fallbackPending = 'loading';
    try {
        let pageUrl = cardData.pageUrl || '';
        if (!pageUrl) {
            const pageUrls = await CIQSupabaseAPI.getAnswerPageUrls(projectId, [{
                key: String(cardData.entryId),
                storagePath: cardData.storagePath,
            }]);
            pageUrl = pageUrls[String(cardData.entryId)];
        }
        if (!pageUrl) throw new Error('Missing page URL');
        const cellUrl = await CIQSupabaseAPI.cropImageRegion(pageUrl, cardData.cellRegion, cardData.pageWidth);
        return { image, card, cellUrl };
    } catch (_) {
        return { image, card, cellUrl: '' };
    }
}

async function applyFallbackImageResult(result) {
    const { image, card, cellUrl } = result || {};
    if (!image || !card || image.dataset.fallbackPending !== 'loading') return;
    if (cellUrl) {
        image.src = cellUrl;
        image.classList.remove('is-loading');
        delete image.dataset.fallbackPending;
        return;
    }
    image.remove();
    const expired = document.createElement('div');
    expired.className = 'img-expired';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-clock';
    expired.append(icon, ' 画像がありません');
    card.prepend(expired);
}

async function prewarmInitialImages(cards, limit = INITIAL_IMAGE_PREWARM_LIMIT) {
    const targets = cards
        .slice(0, limit)
        .filter(card => !card.cellUrl && card.storagePath && card.cellRegion);
    const cellUrls = await CIQSupabaseAPI.getAnswerCellUrls(projectId, targets.map(card => ({
        key: String(card.entryId),
        entryNumber: card.entryNumber,
        questionNumber: currentQ,
    }))).catch(() => ({}));
    const cropTargets = [];
    for (const card of targets) {
        const cellUrl = cellUrls[String(card.entryId)] || '';
        if (cellUrl) {
            card.cellUrl = cellUrl;
        } else {
            cropTargets.push(card);
        }
    }
    const pageUrls = await CIQSupabaseAPI.getAnswerPageUrls(projectId, cropTargets.map(card => ({
        key: String(card.entryId),
        storagePath: card.storagePath,
    }))).catch(() => ({}));
    await runLimited(cropTargets, IMAGE_CROP_CONCURRENCY, async (card) => {
        try {
            card.pageUrl = pageUrls[String(card.entryId)] || card.pageUrl || '';
            if (!card.pageUrl) throw new Error('Missing page URL');
            card.cellUrl = await CIQSupabaseAPI.cropImageRegion(card.pageUrl, card.cellRegion, card.pageWidth);
        } catch (_) {
            card.cellUrl = null;
        }
    });
}

function scheduleBackgroundImagePrewarm(cards, startIndex = INITIAL_IMAGE_PREWARM_LIMIT) {
    const token = ++backgroundPrewarmToken;
    const candidates = cards
        .slice(startIndex)
        .filter(card => !card.cellUrl && card.storagePath && card.cellRegion);
    if (!candidates.length) return;

    let offset = 0;
    const runNextBatch = async () => {
        if (token !== backgroundPrewarmToken) return;
        const batch = candidates.slice(offset, offset + BACKGROUND_PREWARM_BATCH);
        offset += BACKGROUND_PREWARM_BATCH;
        if (!batch.length) return;

        const cellUrls = await CIQSupabaseAPI.getAnswerCellUrls(projectId, batch.map(card => ({
            key: String(card.entryId),
            entryNumber: card.entryNumber,
            questionNumber: currentQ,
        }))).catch(() => ({}));
        const cropBatch = [];
        for (const card of batch) {
            const cellUrl = cellUrls[String(card.entryId)] || '';
            if (cellUrl) {
                card.cellUrl = cellUrl;
            } else {
                cropBatch.push(card);
            }
        }

        const pageUrls = await CIQSupabaseAPI.getAnswerPageUrls(projectId, cropBatch.map(card => ({
            key: String(card.entryId),
            storagePath: card.storagePath,
        }))).catch(() => ({}));

        await runLimited(cropBatch, IMAGE_CROP_CONCURRENCY, async (card) => {
            try {
                card.pageUrl = pageUrls[String(card.entryId)] || card.pageUrl || '';
                if (!card.pageUrl) throw new Error('Missing page URL');
                card.cellUrl = await CIQSupabaseAPI.cropImageRegion(card.pageUrl, card.cellRegion, card.pageWidth);
            } catch (_) {
                card.cellUrl = null;
            }
        });

        if (offset < candidates.length) runWhenIdle(runNextBatch);
    };

    runWhenIdle(runNextBatch);
}

async function init() {
    try {
        const startedAt = performance.now();
        const joined = await CIQSupabaseAPI.joinQuestionScorer(projectId, currentQ);
        currentMemberId = joined.scorer_member_id;
        isCompleted = Boolean(joined.completed_at);

        const dataStartedAt = performance.now();
        const [answerText, cards] = await Promise.all([
            CIQSupabaseAPI.getModelAnswer(projectId, currentQ),
            CIQSupabaseAPI.getQuestionAnswerCards(projectId, currentQ),
        ]);
        const dataMs = Math.round(performance.now() - dataStartedAt);

        document.getElementById('answer-badge').textContent = answerText || '未設定';
        answerCards = cards;

        if (answerCards.length === 0) {
            setAnswerGridMessage('答案データがありません', 'fa-solid fa-inbox');
            return;
        }

        const imageStatsBefore = CIQSupabaseAPI.takeImagePerfStats();
        const prewarmStartedAt = performance.now();
        await prewarmInitialImages(answerCards);
        const prewarmMs = Math.round(performance.now() - prewarmStartedAt);
        const initialImageStats = CIQSupabaseAPI.takeImagePerfStats(imageStatsBefore);
        await refreshVotes();
        scheduleBackgroundImagePrewarm(answerCards);
        logPerf('questionInitialLoad', {
            questionNumber: currentQ,
            cards: answerCards.length,
            dataMs,
            initialImageMs: prewarmMs,
            imageStats: initialImageStats,
            totalMs: Math.round(performance.now() - startedAt),
        });
    } catch (e) {
        setAnswerGridMessage(e.message || '採点データを読み込めませんでした', 'fa-solid fa-triangle-exclamation');
    }
}

async function refreshVotes() {
    const votes = await CIQSupabaseAPI.listMyQuestionScoreVotes(projectId, currentQ, currentMemberId);
    const myVoteByEntry = new Map();
    for (const vote of votes) {
        myVoteByEntry.set(vote.entry_id, vote);
    }
    const nextScores = {};
    for (const card of answerCards) {
        if (pendingWrites[card.entryId] !== undefined) {
            nextScores[card.entryId] = pendingWrites[card.entryId];
            continue;
        }
        const vote = myVoteByEntry.get(card.entryId);
        nextScores[card.entryId] = vote?.result || null;
    }
    for (const [entryId, result] of Object.entries(pendingWrites)) {
        const serverVote = myVoteByEntry.get(entryId);
        if (serverVote?.result === result) delete pendingWrites[entryId];
    }
    myScores = nextScores;
    renderGrid();
    checkAutoCompletion();
}

function renderGrid() {
    const grid = document.getElementById('answer-grid');
    if (selectedIndex >= answerCards.length) selectedIndex = Math.max(0, answerCards.length - 1);

    const total = answerCards.length;
    let done = 0;
    for (const card of answerCards) {
        if (myScores[card.entryId] !== null) done++;
    }
    document.getElementById('progress-text').textContent = `${done} / ${total} 件`;

    let createdCards = false;
    if (grid.children.length === answerCards.length && grid.children[0]?.className?.includes('answer-card')) {
        answerCards.forEach((cardData, idx) => {
            const myScore = myScores[cardData.entryId];
            const card = grid.children[idx];
            updateAnswerCardClass(card, myScore, idx === selectedIndex);
        });
    } else {
        createdCards = true;
        grid.textContent = '';
        const fragment = document.createDocumentFragment();
        answerCards.forEach((cardData, idx) => {
            fragment.appendChild(createAnswerCard(cardData, idx));
        });
        grid.appendChild(fragment);
    }

    if (createdCards) scrollToSelected();
}

async function mark(entryId, result) {
    pendingWrites[entryId] = result;
    myScores[entryId] = result;
    renderGrid();
    try {
        await CIQSupabaseAPI.setScoreVote(projectId, currentQ, entryId, result);
        if (pendingWrites[entryId] === result) delete pendingWrites[entryId];
        myScores[entryId] = result;
        renderGrid();
        await checkAutoCompletion();
    } catch (e) {
        delete pendingWrites[entryId];
        showToast('採点の保存に失敗しました: ' + e.message, 'error');
        await refreshVotes();
    }
}

function selectCard(idx) {
    if (idx < 0 || idx >= answerCards.length) return;
    selectedIndex = idx;
    const cards = document.querySelectorAll('.answer-card');
    cards.forEach((card, i) => {
        const selected = i === selectedIndex;
        card.classList.toggle('selected', selected);
        card.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    scrollToSelected();
}

function advanceSelection() {
    if (selectedIndex < answerCards.length - 1) selectCard(selectedIndex + 1);
}

function getGridCols() {
    const grid = document.getElementById('answer-grid');
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
}

function scrollToSelected() {
    const cards = document.querySelectorAll('.answer-card');
    if (cards[selectedIndex]) {
        cards[selectedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function scoreSelected(status) {
    if (answerCards.length === 0) return;
    const cardData = answerCards[selectedIndex];
    if (!cardData) return;
    const cards = document.querySelectorAll('.answer-card');
    const card = cards[selectedIndex];
    if (card) {
        card.classList.add('score-pop');
        setTimeout(() => card.classList.remove('score-pop'), 150);
    }
    mark(cardData.entryId, status);
    advanceSelection();
}

document.getElementById('question-back-btn')?.addEventListener('click', () => {
    location.href = 'judge.html';
});
document.getElementById('score-correct-btn')?.addEventListener('click', () => scoreSelected('correct'));
document.getElementById('score-wrong-btn')?.addEventListener('click', () => scoreSelected('wrong'));
document.getElementById('score-hold-btn')?.addEventListener('click', () => scoreSelected('hold'));

document.addEventListener('keydown', (e) => {
    if (answerCards.length === 0) return;
    const key = e.key;
    if (key === 'm' || key === 'M') {
        e.preventDefault();
        const cardData = answerCards[selectedIndex];
        if (cardData) {
            mark(cardData.entryId, 'correct');
            advanceSelection();
        }
    } else if (key === 'x' || key === 'X') {
        e.preventDefault();
        const cardData = answerCards[selectedIndex];
        if (cardData) {
            mark(cardData.entryId, 'wrong');
            advanceSelection();
        }
    } else if (key === 'h' || key === 'H') {
        e.preventDefault();
        const cardData = answerCards[selectedIndex];
        if (cardData) {
            mark(cardData.entryId, 'hold');
            advanceSelection();
        }
    } else if (key === 'ArrowRight') {
        e.preventDefault();
        selectCard(selectedIndex + 1);
    } else if (key === 'ArrowLeft') {
        e.preventDefault();
        selectCard(selectedIndex - 1);
    } else if (key === 'ArrowDown') {
        e.preventDefault();
        selectCard(selectedIndex + getGridCols());
    } else if (key === 'ArrowUp') {
        e.preventDefault();
        selectCard(selectedIndex - getGridCols());
    }
});

async function checkAutoCompletion() {
    const total = answerCards.length;
    const done = answerCards.filter(card => myScores[card.entryId] !== null).length;
    document.getElementById('progress-text').textContent = `${done} / ${total} 件`;
    if (done === total && total > 0 && !isCompleted) {
        isCompleted = true;
        await CIQSupabaseAPI.completeQuestionScoring(projectId, currentQ);
        location.href = 'judge.html';
    }
}

init();
