// conflict.js - 要確認（Supabase）

const auth = requireAuth({ requireAdmin: true });
if (!auth) throw new Error('auth');
const { projectId } = auth;

let serverConflictRows = null;
let currentConflicts = [];
let selectedIndex = 0;
let cellUrlCache = {};
let cellUrlPreloadKey = '';
let conflictImageObserver = null;
let conflictImageFlushTimer = null;
const conflictImageQueue = new Map();
const CONFLICT_IMAGE_CROP_CONCURRENCY = 12;
const BACKGROUND_CONFLICT_IMAGE_BATCH = 24;
let conflictBackgroundPreloadToken = 0;
let lastConflictRenderSignature = '';
let lastConflictStructureSignature = '';
let conflictRefreshTimer = null;
let conflictRefreshPromise = null;
let shouldResetConflictSelection = true;
// ?q=N のとき、その問題の確認済みの全員の答案を並べて、確定を直接決め直す(管理者として開く)
const reviewQuestion = (() => {
    const value = Number(new URLSearchParams(location.search).get('q'));
    return Number.isInteger(value) && value >= 1 ? value : null;
})();
// 保存が終わっていない判定。question.js の pendingWrites と同じく、再取得の結果に重ねて、色が一瞬戻るのを防ぐ
const pendingFinals = new Map();

// limit 本を常に動かす（遅い1本に、同じまとまりの残りが待たされない）
async function runLimited(items, limit, task) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await task(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

function preloadImageUrl(url) {
    if (!url) return Promise.resolve();
    return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            if (image.decode) {
                image.decode().then(resolve).catch(resolve);
                return;
            }
            resolve();
        };
        image.onerror = resolve;
        image.src = url;
    });
}

async function preloadImageUrls(urls, limit = CONFLICT_IMAGE_CROP_CONCURRENCY) {
    const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
    if (!uniqueUrls.length) return;
    await runLimited(uniqueUrls, limit, preloadImageUrl);
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function getConflictGridColumnCount(grid) {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, columns || 1);
}

function getMedianConflictAspect(conflicts) {
    const aspects = conflicts
        .map(conflict => {
            const region = conflict.cellRegion || null;
            const width = Number(region?.w || 0);
            const height = Number(region?.h || 0);
            return width > 0 && height > 0 ? height / width : 0;
        })
        .filter(Boolean)
        .sort((a, b) => a - b);
    if (!aspects.length) return 0.62;
    return aspects[Math.floor(aspects.length / 2)];
}

function getInitialConflictImageLimit(conflicts) {
    const grid = document.getElementById('conflict-grid');
    const style = getComputedStyle(grid);
    const columns = getConflictGridColumnCount(grid);
    const columnGap = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
    const inlinePadding = (Number.parseFloat(style.paddingLeft || '0') || 0) + (Number.parseFloat(style.paddingRight || '0') || 0);
    const gridWidth = Math.max(1, grid.clientWidth || window.innerWidth);
    const cardWidth = Math.max(1, (gridWidth - inlinePadding - columnGap * (columns - 1)) / columns);
    const estimatedRowHeight = Math.max(96, cardWidth * getMedianConflictAspect(conflicts) + 76);
    const gridTop = Math.max(0, grid.getBoundingClientRect().top);
    const visibleHeight = Math.max(estimatedRowHeight, window.innerHeight - gridTop);
    const rows = Math.max(1, Math.ceil(visibleHeight / estimatedRowHeight) + 1);
    return Math.min(conflicts.length, columns * rows);
}

function setConflictGridMessage(message, options = {}) {
    const grid = document.getElementById('conflict-grid');
    grid.textContent = '';
    const messageEl = document.createElement('div');
    messageEl.className = `${options.className || 'loading-state'} grid-message`;
    if (options.icon) {
        const icon = createIcon(options.icon);
        if (options.iconSize) {
            icon.classList.add('message-icon-large');
        }
        if (options.iconColor === 'var(--success)') icon.classList.add('message-icon-success');
        messageEl.append(icon, ' ');
    }
    messageEl.appendChild(document.createTextNode(message));
    grid.appendChild(messageEl);
}

function setConflictActionsDisabled(disabled) {
    document.getElementById('conflict-action-bar')?.classList.toggle('u-hidden', disabled);
    document.getElementById('conflict-correct-btn')?.toggleAttribute('disabled', disabled);
    document.getElementById('conflict-wrong-btn')?.toggleAttribute('disabled', disabled);
}

function setReviewTitle() {
    if (!reviewQuestion) return;
    const heading = document.querySelector('.fixed-header h1');
    const text = heading && Array.from(heading.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (text) text.textContent = ` 第${reviewQuestion}問`;
}

async function init() {
    setReviewTitle();
    try {
        selectedIndex = 0;
        shouldResetConflictSelection = true;
        await refreshData();
        startConflictRefreshTimer();
    } catch (e) {
        setConflictGridMessage(describeError(e, '要確認データを読み込めませんでした'), { icon: 'triangle-exclamation' });
        const counter = document.getElementById('counter');
        counter.textContent = '読み込み失敗';
        counter.className = 'counter has-conflicts';
    }
}

function startConflictRefreshTimer() {
    if (conflictRefreshTimer || document.hidden) return;
    conflictRefreshTimer = setInterval(() => {
        // 一時的な失敗は、いま出ている一覧のままにして、次の更新で取り直す
        refreshData().catch((error) => console.warn('要確認の更新に失敗:', error));
    }, 5000);
}

function stopConflictRefreshTimer() {
    if (!conflictRefreshTimer) return;
    clearInterval(conflictRefreshTimer);
    conflictRefreshTimer = null;
}

async function refreshData() {
    if (conflictRefreshPromise) return conflictRefreshPromise;
    conflictRefreshPromise = refreshDataInternal().finally(() => {
        conflictRefreshPromise = null;
    });
    return conflictRefreshPromise;
}

// 要確認の一覧は、サーバー(list_score_conflicts)の定義だけで決める。取得できなかったときに、
// 画面側で別の計算に切り替えない(受付済みの人だけを数えるなど、サーバーの定義とずれるため)。
async function refreshDataInternal() {
    const startedAt = performance.now();
    if (reviewQuestion) {
        serverConflictRows = await CIQSupabaseAPI.listQuestionReview(projectId, reviewQuestion);
    } else {
        // 要確認(判定が割れたもの)と、管理者が覆したもの(判定は一致していた)は、別々に取る
        const [conflicts, overrides] = await Promise.all([
            CIQSupabaseAPI.listScoreConflicts(projectId),
            CIQSupabaseAPI.listAdminOverrides(projectId),
        ]);
        conflicts.forEach(row => { row.section = 'conflict'; });
        overrides.forEach(row => { row.section = 'override'; });
        serverConflictRows = overrides.concat(conflicts);
    }
    serverConflictRows.forEach((row) => {
        const key = `${row.q}:${row.entryId}`;
        if (!pendingFinals.has(key)) return;
        if (row.finalResult === pendingFinals.get(key)) pendingFinals.delete(key);
        else row.finalResult = pendingFinals.get(key);
    });
    const dataMs = Math.round(performance.now() - startedAt);
    const renderStartedAt = performance.now();
    await render();
    logPerf('conflictRefresh', {
        conflicts: currentConflicts.length,
        dataMs,
        renderMs: Math.round(performance.now() - renderStartedAt),
        totalMs: Math.round(performance.now() - startedAt),
    });
}

function buildConflicts() {
    return serverConflictRows || [];
}

function getMissingConflictImageRequests(conflicts) {
    return conflicts
        .map(conflict => ({
            key: `${conflict.entryNumber}:q${conflict.q}`,
            entryNumber: conflict.entryNumber,
            questionNumber: conflict.q,
            entryId: conflict.entryId,
            storagePath: conflict.storagePath,
            cellRegion: conflict.cellRegion || null,
            pageWidth: conflict.pageWidth,
            cellStatus: conflict.cellStatus || null,
            cellPath: conflict.cellPath || null,
        }))
        .filter(request => cellUrlCache[request.key] === undefined);
}

function getConflictRenderSignature(conflicts) {
    return conflicts.map((conflict) => {
        const votes = conflict.votes
            .map(vote => `${vote.scorer_member_id || ''}:${vote.result || ''}`)
            .sort()
            .join(',');
        return [
            conflict.q,
            conflict.entryId,
            conflict.entryNumber,
            conflict.finalResult || '',
            (conflict.modelAltAnswers || []).join('/'),
            conflict.modelAnswer || '',
            votes,
        ].join(':');
    }).join('|');
}

function getConflictStructureSignature(conflicts) {
    return conflicts.map(conflict => [
        conflict.q,
        conflict.entryId,
        conflict.modelAnswer || '',
        (conflict.modelAltAnswers || []).join('/'),
    ].join(':')).join('|');
}

function createVotesMini(conflict) {
    const votes = document.createElement('div');
    votes.className = 'votes-mini';
    conflict.votes.forEach((vote) => {
        const dot = createVoteDot(vote.result);
        if (dot) votes.appendChild(dot);
    });
    return votes;
}

function getConflictCards() {
    return Array.from(document.querySelectorAll('.conflict-card'));
}

function patchConflictCards() {
    const cards = getConflictCards();
    currentConflicts.forEach((conflict, idx) => {
        const card = cards[idx];
        if (!card) return;
        card._ciqConflict = conflict;
        card.classList.remove('resolved', 'correct', 'wrong');
        if (conflict.finalResult) card.classList.add('resolved', conflict.finalResult);
        const oldVotes = card.querySelector('.votes-mini');
        const newVotes = createVotesMini(conflict);
        const hasVotes = newVotes.childNodes.length > 0;
        if (oldVotes && hasVotes) oldVotes.replaceWith(newVotes);
        else if (oldVotes) oldVotes.remove();
        else if (hasVotes) card.appendChild(newVotes);
    });
}

function updateConflictSelectionClasses() {
    document.querySelectorAll('.conflict-card').forEach((card, i) => {
        const selected = i === selectedIndex;
        card.classList.toggle('selected', selected);
        card.setAttribute('aria-selected', selected ? 'true' : 'false');
        card.tabIndex = selected ? 0 : -1;
    });
}

async function render() {
    const previousSelected = currentConflicts[selectedIndex] || null;
    currentConflicts = buildConflicts().sort(compareConflictsByQuestionAndEntry);
    CIQSupabaseAPI.enqueueAnswerCellGeneration(projectId, currentConflicts.map(conflict => ({
        ...conflict,
        questionNumber: conflict.q,
    })));
    if (shouldResetConflictSelection) {
        // question.js の setInitialSelectionToFirstUnscored と同じく、未確定の先頭から始める。
        // 確定済みカードは並び替えずその場に残るので、先頭固定だと確定済みを選んだ状態で開いてしまう。
        const firstUnresolved = currentConflicts.findIndex(conflict => !conflict.finalResult);
        selectedIndex = firstUnresolved >= 0 ? firstUnresolved : 0;
        shouldResetConflictSelection = false;
    } else if (previousSelected) {
        const nextIndex = currentConflicts.findIndex(conflict => (
            conflict.entryId === previousSelected.entryId
            && Number(conflict.q) === Number(previousSelected.q)
        ));
        selectedIndex = nextIndex >= 0 ? nextIndex : Math.min(selectedIndex, Math.max(0, currentConflicts.length - 1));
    } else if (selectedIndex >= currentConflicts.length) {
        selectedIndex = Math.max(0, currentConflicts.length - 1);
    }

    const conflictList = currentConflicts.filter(c => c.section !== 'override');
    const overrideList = currentConflicts.filter(c => c.section === 'override');
    const unresolvedCount = conflictList.filter(c => !c.finalResult).length;
    const counter = document.getElementById('counter');
    if (reviewQuestion) {
        counter.textContent = `${currentConflicts.length}人`;
        counter.className = 'counter';
    } else if (conflictList.length === 0 || unresolvedCount === 0) {
        counter.textContent = `全${conflictList.length}件 確定済み`;
        counter.className = 'counter all-clear';
    } else {
        // 採点ページと同じく、済んだ件数 / 全件(確定した数)。残りの数ではない
        counter.textContent = `${conflictList.length - unresolvedCount} / ${conflictList.length}件`;
        counter.className = 'counter has-conflicts';
    }
    document.getElementById('override-section').hidden = overrideList.length === 0;
    document.getElementById('conflict-section-title').hidden = overrideList.length === 0;

    const grid = document.getElementById('conflict-grid');
    if (currentConflicts.length === 0) {
        setConflictActionsDisabled(true);
        lastConflictRenderSignature = '';
        lastConflictStructureSignature = '';
        setConflictGridMessage(reviewQuestion ? `第${reviewQuestion}問の答案はありません` : '要確認はありません', {
            className: 'loading-state no-conflict',
            icon: 'circle-check',
            iconSize: '48px',
            iconColor: 'var(--success)',
        });
        return;
    }
    setConflictActionsDisabled(false);

    const renderSignature = getConflictRenderSignature(currentConflicts);
    if (renderSignature === lastConflictRenderSignature && getConflictCards().length === currentConflicts.length) {
        updateConflictSelectionClasses();
        return;
    }

    // 並びや内容が同じで、判定・確定だけが変わったときは、カードを作り直さずその場で直す。
    // 作り直すと、全カードの描画と画像の読み直しで数秒止まり、押した色が消えて見える。
    const structureSignature = getConflictStructureSignature(currentConflicts);
    if (structureSignature === lastConflictStructureSignature && getConflictCards().length === currentConflicts.length) {
        lastConflictRenderSignature = renderSignature;
        patchConflictCards();
        updateConflictSelectionClasses();
        return;
    }

    const initialImageLimit = getInitialConflictImageLimit(currentConflicts);
    const missingImages = getMissingConflictImageRequests(currentConflicts.slice(0, initialImageLimit));
    if (missingImages.length) {
        lastConflictStructureSignature = '';
        setConflictGridMessage('画像を準備中…', { icon: 'spinner' });
        const imageStatsBefore = CIQSupabaseAPI.takeImagePerfStats();
        const imageStartedAt = performance.now();
        await ensureConflictCellUrls(missingImages);
        await preloadImageUrls(missingImages.map(request => cellUrlCache[request.key]));
        logPerf('conflictImagePrep', {
            requested: missingImages.length,
            initialImageLimit,
            imageMs: Math.round(performance.now() - imageStartedAt),
            imageStats: CIQSupabaseAPI.takeImagePerfStats(imageStatsBefore),
        });
        await render();
        return;
    }

    lastConflictRenderSignature = renderSignature;
    lastConflictStructureSignature = structureSignature;
    const overrideGrid = document.getElementById('override-grid');
    grid.textContent = '';
    overrideGrid.textContent = '';
    const fragment = document.createDocumentFragment();
    const overrideFragment = document.createDocumentFragment();
    currentConflicts.forEach((conflict, idx) => {
        const card = createConflictCard(conflict, idx);
        card.addEventListener('click', () => selectConflictCard(idx, { focus: true }));
        card.addEventListener('focus', () => selectConflictCard(idx));
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectConflictCard(idx, { focus: true });
        });
        bindPreviewGesture(card, () => showPreview(projectId, conflict.entryNumber));
        (conflict.section === 'override' ? overrideFragment : fragment).appendChild(card);
    });
    grid.appendChild(fragment);
    overrideGrid.appendChild(overrideFragment);
    if (!conflictList.length) {
        // 要確認はないが、管理者が覆したものはある
        setConflictGridMessage('要確認はありません', {
            className: 'loading-state no-conflict',
            icon: 'circle-check',
            iconSize: '48px',
            iconColor: 'var(--success)',
        });
    }
    // 再描画の直前に取得が完了していたカードを拾う(プレースホルダの取り残し防止)。
    updateVisibleConflictImages();
    scheduleBackgroundConflictImages(currentConflicts, initialImageLimit);

    scrollToSelectedConflict();
}

function compareConflictsByQuestionAndEntry(a, b) {
    // 管理者が覆したものを先頭に。それぞれ、問題番号 → 受付番号の順(採点ページと同じ並び)
    return (a.section === 'override' ? 0 : 1) - (b.section === 'override' ? 0 : 1)
        || Number(a.q || a.questionNumber || 0) - Number(b.q || b.questionNumber || 0)
        || Number(a.entryNumber || 0) - Number(b.entryNumber || 0);
}

function createVoteDot(result) {
    const dot = document.createElement('span');
    if (result === 'correct') {
        dot.className = 'vote-dot correct';
        dot.appendChild(createIcon('circle', { size: 12, title: '正解' }));
    } else if (result === 'wrong') {
        dot.className = 'vote-dot wrong';
        dot.appendChild(createIcon('xmark', { size: 12, title: '不正解' }));
    } else if (result === 'hold') {
        dot.className = 'vote-dot hold';
        dot.appendChild(createIcon('triangle', { size: 12, title: '保留' }));
    } else {
        return null;
    }
    return dot;
}

function createConflictCard(conflict, idx) {
    const cacheKey = `${conflict.entryNumber}:q${conflict.q}`;
    const cellUrl = cellUrlCache[cacheKey];
    // cellUrlCache の状態: undefined=未取得 / null=取得中 / ''=取得済みで画像なし / 文字列=URL。
    // null を「取得済み」と数えると、取得中のカードに「画像がありません」と出てしまう。
    const isResolved = typeof cellUrl === 'string';
    const modelAnswer = conflict.modelAnswer || '';
    const modelAlts = conflict.modelAltAnswers || [];

    const card = document.createElement('div');
    card.className = `answer-card conflict-card ${conflict.finalResult ? 'resolved ' + conflict.finalResult : ''} ${idx === selectedIndex ? 'selected' : ''}`;
    card.setAttribute('role', 'gridcell');
    card.setAttribute('aria-label', `${conflict.displayName} ${conflict.q}問 要確認`);
    card.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    card.tabIndex = idx === selectedIndex ? 0 : -1;
    card._ciqConflict = conflict;
    if (cellUrl) {
        const image = document.createElement('img');
        image.src = cellUrl;
        image.alt = `${conflict.displayName} ${conflict.q}問`;
        image.loading = idx < 12 ? 'eager' : 'lazy';
        image.decoding = 'async';
        if (idx < 12) image.fetchPriority = 'high';
        attachConflictImageErrorFallback(image, conflict);
        card.appendChild(image);
    } else {
        const expired = document.createElement('div');
        expired.className = 'img-expired';
        const icon = createIcon('clock');
        expired.append(icon, isResolved ? ' 画像がありません' : ' 画像を読み込み中');
        card.appendChild(expired);
        if (!isResolved && conflict.storagePath && conflict.cellRegion) {
            observeConflictImage(card, conflict);
        }
    }

    const reviewRow = document.createElement('div');
    reviewRow.className = 'conflict-review-row';
    const model = document.createElement('span');
    model.className = 'conflict-review-answer';
    model.textContent = modelAnswer || '未登録';
    // 別解は主答えに続けて薄く出す。ラベルは置かない(採点画面と同じ表記)。
    if (modelAlts.length) {
        const alts = document.createElement('span');
        alts.className = 'conflict-review-alts';
        alts.textContent = ` / ${modelAlts.join(' / ')}`;
        model.appendChild(alts);
    }
    // 採点者の名前は出さない。3人ぶんの判定は、模範解答の行とは別の行に並べる(模範解答を削らない)
    const votes = createVotesMini(conflict);
    reviewRow.append(model);
    card.appendChild(reviewRow);
    if (votes.childNodes.length) card.appendChild(votes);
    return card;
}

function scoreSelectedConflict(result) {
    const conflict = currentConflicts[selectedIndex];
    if (!conflict) return;
    const card = document.querySelectorAll('.conflict-card')[selectedIndex];
    if (card) {
        card.classList.add('score-pop');
        setTimeout(() => card.classList.remove('score-pop'), 150);
    }
    // 書き込みを待たずに選択を進める(question.js の scoreSelected と同じ)。
    // 進めるのは setFinal より前。render() は「描画開始時点の選択」を復元するので、
    // 後から進めると選択が判定済みのカードへ戻ってしまう。
    advanceConflictSelection();
    setFinal(conflict.q, conflict.entryId, result)
        .catch(err => showToast(describeError(err, '最終判定を保存できませんでした。'), 'error'));
}

function attachConflictImageErrorFallback(image, conflict) {
    image.addEventListener('error', () => {
        const key = `${conflict.entryNumber}:q${conflict.q}`;
        if (conflict.cellStatus === 'ready') {
            CIQSupabaseAPI.markAnswerCellFailed(projectId, conflict.entryId, conflict.q);
        }
        delete cellUrlCache[key];
        const placeholder = document.createElement('div');
        placeholder.className = 'img-expired';
        const icon = createIcon('clock');
        placeholder.append(icon, ' 画像を読み込み中');
        image.replaceWith(placeholder);
        queueConflictImage(conflict);
    }, { once: true });
}

function observeConflictImage(card, conflict) {
    if (!conflictImageObserver && 'IntersectionObserver' in window) {
        conflictImageObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                conflictImageObserver.unobserve(entry.target);
                queueConflictImage(entry.target._ciqConflict);
            });
        }, { rootMargin: '300px 0px' });
    }
    card._ciqConflict = conflict;
    if (conflictImageObserver) {
        conflictImageObserver.observe(card);
    } else {
        queueConflictImage(conflict);
    }
}

function queueConflictImage(conflict) {
    const key = `${conflict.entryNumber}:q${conflict.q}`;
    const cached = cellUrlCache[key];
    if (typeof cached === 'string') {
        // 背景プリロードが先にキャッシュを埋めていることがある。ここで黙って返すと
        // カードのプレースホルダが「画像を読み込み中」のまま残るため、その場で反映する。
        updateVisibleConflictImages([{ key }]);
        return;
    }
    if (cached === null) return; // 取得中。完了時に flush 側が反映する
    conflictImageQueue.set(key, {
        key,
        entryNumber: conflict.entryNumber,
        questionNumber: conflict.q,
        storagePath: conflict.storagePath,
        cellRegion: conflict.cellRegion || null,
        pageWidth: conflict.pageWidth,
        cellStatus: conflict.cellStatus || null,
        cellPath: conflict.cellPath || null,
        entryId: conflict.entryId,
    });
    if (conflictImageFlushTimer) return;
    conflictImageFlushTimer = setTimeout(flushConflictImages, 40);
}

async function flushConflictImages() {
    conflictImageFlushTimer = null;
    const batch = Array.from(conflictImageQueue.values());
    conflictImageQueue.clear();
    if (!batch.length) return;
    await ensureConflictCellUrls(batch);
    await preloadImageUrls(batch.map(request => cellUrlCache[request.key]));
    await nextFrame();
    updateVisibleConflictImages(batch);
}

// requests を省略すると、いま画面にある全カードを対象に掃く。
// 取得済みなのにプレースホルダのまま残っているカードを最後に拾うために使う。
function updateVisibleConflictImages(requests) {
    const requestKeys = requests ? new Set(requests.map(request => request.key)) : null;
    document.querySelectorAll('.conflict-card').forEach((card) => {
        const conflict = card._ciqConflict;
        if (!conflict) return;
        const key = `${conflict.entryNumber}:q${conflict.q}`;
        if (requestKeys && !requestKeys.has(key)) return;
        const cellUrl = cellUrlCache[key];
        if (typeof cellUrl !== 'string') return; // 未取得・取得中はプレースホルダのまま待つ
        const imageSlot = card.querySelector('.img-expired');
        if (!imageSlot) return;
        if (!cellUrl) {
            imageSlot.textContent = '';
            const icon = createIcon('clock');
            imageSlot.append(icon, ' 画像がありません');
            return;
        }
        const image = document.createElement('img');
        image.src = cellUrl;
        image.alt = `${conflict.displayName} ${conflict.q}問`;
        image.loading = 'lazy';
        image.decoding = 'async';
        attachConflictImageErrorFallback(image, conflict);
        imageSlot.replaceWith(image);
    });
}

async function ensureConflictCellUrls(missing) {
    if (!missing.length) return;

    const preloadKey = missing.map(request => request.key).sort().join('|');
    if (preloadKey === cellUrlPreloadKey) return;
    cellUrlPreloadKey = preloadKey;
    for (const request of missing) cellUrlCache[request.key] = null;

    try {
        const readyMissing = missing.filter(request => request.cellStatus === 'ready');
        const cellUrls = await CIQSupabaseAPI.getAnswerCellUrls(projectId, readyMissing.map(request => ({
            key: request.key,
            entryNumber: request.entryNumber,
            questionNumber: request.questionNumber,
            cellPath: request.cellPath,
        }))).catch(() => ({}));
        const fallbackRequests = missing.filter((request) => {
            const cellUrl = cellUrls[request.key] || '';
            if (cellUrl) {
                cellUrlCache[request.key] = cellUrl;
                return false;
            }
            return request.storagePath && request.cellRegion;
        });
        const pageUrls = await CIQSupabaseAPI.getAnswerPageUrls(projectId, fallbackRequests.map(request => ({
            key: request.key,
            storagePath: request.storagePath,
        }))).catch(() => ({}));
        await runLimited(fallbackRequests, CONFLICT_IMAGE_CROP_CONCURRENCY, async (request) => {
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

function scheduleBackgroundConflictImages(conflicts, startIndex) {
    const token = ++conflictBackgroundPreloadToken;
    const candidates = getMissingConflictImageRequests(conflicts.slice(startIndex));
    if (!candidates.length) return;

    let offset = 0;
    const runNextBatch = async () => {
        if (token !== conflictBackgroundPreloadToken) return;
        const batch = candidates.slice(offset, offset + BACKGROUND_CONFLICT_IMAGE_BATCH);
        offset += BACKGROUND_CONFLICT_IMAGE_BATCH;
        if (!batch.length) return;

        await ensureConflictCellUrls(batch);
        // 背景取得でも必ずDOMへ反映する。ここを省くとキャッシュだけが埋まり、
        // 後から交差監視が発火しても queueConflictImage が「取得済み」で弾くため、
        // カードが「画像を読み込み中」のまま永久に残る。
        await preloadImageUrls(batch.map(request => cellUrlCache[request.key]));
        updateVisibleConflictImages(batch);
        if (offset < candidates.length) runWhenIdle(runNextBatch);
    };

    runWhenIdle(runNextBatch);
}

// question.js の mark() と同じ流れ: まず手元の状態を更新して即座に描画し、
// そのあと書き込む。失敗したら元に戻して知らせる。
// (以前は書き込み完了まで何も変わらず、そのうえ全件再取得していた)
function applyLocalFinalResult(q, entryId, result) {
    const questionNumber = Number(q);
    const row = (serverConflictRows || []).find(item => (
        Number(item.q) === questionNumber && item.entryId === entryId
    ));
    if (!row) return () => {};
    const previous = row.finalResult;
    row.finalResult = result;
    return () => { row.finalResult = previous; };
}

// 判定した瞬間にカードの色だけ手元で変える(全体の再描画や再取得を待たない)
function paintConflictResult(q, entryId, finalResult) {
    const index = currentConflicts.findIndex(item => (
        Number(item.q) === Number(q) && item.entryId === entryId
    ));
    const card = index >= 0 ? document.querySelectorAll('.conflict-card')[index] : null;
    if (!card) return;
    card.classList.remove('resolved', 'correct', 'wrong');
    if (finalResult) card.classList.add('resolved', finalResult);
}

async function setFinal(q, entryId, result) {
    const key = `${q}:${entryId}`;
    const rollback = applyLocalFinalResult(q, entryId, result);
    pendingFinals.set(key, result);
    paintConflictResult(q, entryId, result);
    try {
        await CIQSupabaseAPI.resolveScoreConflict(projectId, q, entryId, result);
    } catch (error) {
        if (pendingFinals.get(key) === result) pendingFinals.delete(key);
        rollback();
        await render();
        throw error;
    }
    await refreshData();
}

function selectConflictCard(idx, options = {}) {
    if (idx < 0 || idx >= currentConflicts.length) return;
    selectedIndex = idx;
    updateConflictSelectionClasses();
    const cards = document.querySelectorAll('.conflict-card');
    // 前に選んでいたカードにフォーカスが残ると、青い枠が2枚に出る。選択に合わせてフォーカスも移す。
    const active = document.activeElement;
    if (options.focus || (active && active !== cards[selectedIndex] && active.classList?.contains('conflict-card'))) {
        cards[selectedIndex]?.focus({ preventScroll: true });
    }
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
    const card = cards[selectedIndex];
    if (!card) return;
    scrollElementIntoReviewViewport(card);
}

function scrollElementIntoReviewViewport(element) {
    const header = document.querySelector('.fixed-header');
    const topLimit = (header?.getBoundingClientRect().bottom || 0) + 16;
    const actionBar = document.getElementById('conflict-action-bar');
    const actionTop = actionBar && getComputedStyle(actionBar).display !== 'none'
        ? actionBar.getBoundingClientRect().top
        : window.innerHeight;
    const bottomLimit = Math.max(topLimit + 80, actionTop - 16);
    const rect = element.getBoundingClientRect();

    if (rect.bottom > bottomLimit) {
        window.scrollBy({ top: rect.bottom - bottomLimit, behavior: 'auto' });
    } else if (rect.top < topLimit) {
        window.scrollBy({ top: rect.top - topLimit, behavior: 'auto' });
    }
}

document.addEventListener('keydown', (e) => {
    if (currentConflicts.length === 0) return;
    const key = e.key;
    if (key === 'm' || key === 'M') {
        e.preventDefault();
        scoreSelectedConflict('correct');
    } else if (key === 'x' || key === 'X') {
        e.preventDefault();
        scoreSelectedConflict('wrong');
    } else if (key === 'ArrowRight') {
        e.preventDefault();
        selectConflictCard(selectedIndex + 1, { focus: true });
    } else if (key === 'ArrowLeft') {
        e.preventDefault();
        selectConflictCard(selectedIndex - 1, { focus: true });
    } else if (key === 'ArrowDown') {
        e.preventDefault();
        selectConflictCard(selectedIndex + getConflictGridCols(), { focus: true });
    } else if (key === 'ArrowUp') {
        e.preventDefault();
        selectConflictCard(selectedIndex - getConflictGridCols(), { focus: true });
    }
});

document.getElementById('conflict-correct-btn')?.addEventListener('click', () => scoreSelectedConflict('correct'));
document.getElementById('conflict-wrong-btn')?.addEventListener('click', () => scoreSelectedConflict('wrong'));

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopConflictRefreshTimer();
        return;
    }
    refreshData().catch(err => showToast(describeError(err, '要確認データを読み込めませんでした。'), 'error'));
    startConflictRefreshTimer();
});

document.getElementById('conflict-back-btn')?.addEventListener('click', () => {
    navigateBack(opsBackTarget());
});

init();

window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    selectedIndex = 0;
    shouldResetConflictSelection = true;
    refreshData();
});
