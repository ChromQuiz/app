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

document.getElementById('q-badge').textContent = `${currentQ} 問`;

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

    if (cardData.cellUrl) {
        const image = document.createElement('img');
        image.src = cardData.cellUrl;
        image.alt = cardData.displayName;
        image.loading = 'eager';
        image.decoding = 'async';
        card.appendChild(image);
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

async function init() {
    try {
        const joined = await CIQSupabaseAPI.joinQuestionScorer(projectId, currentQ);
        currentMemberId = joined.scorer_member_id;
        isCompleted = Boolean(joined.completed_at);

        const [answerText, cards] = await Promise.all([
            CIQSupabaseAPI.getModelAnswer(projectId, currentQ),
            CIQSupabaseAPI.getQuestionAnswerCards(projectId, currentQ),
        ]);

        document.getElementById('answer-badge').textContent = answerText || '未設定';
        answerCards = cards;

        if (answerCards.length === 0) {
            setAnswerGridMessage('答案データがありません', 'fa-solid fa-inbox');
            return;
        }

        await refreshVotes();
        setInterval(refreshVotes, 3000);
    } catch (e) {
        setAnswerGridMessage(e.message || '採点データを読み込めませんでした', 'fa-solid fa-triangle-exclamation');
    }
}

async function refreshVotes() {
    const votes = await CIQSupabaseAPI.listQuestionScoreVotes(projectId, currentQ);
    const nextScores = {};
    for (const card of answerCards) {
        if (pendingWrites[card.entryId] !== undefined) {
            nextScores[card.entryId] = pendingWrites[card.entryId];
            continue;
        }
        const vote = votes.find(row => row.entry_id === card.entryId && row.scorer_member_id === currentMemberId);
        nextScores[card.entryId] = vote?.result || null;
    }
    for (const [entryId, result] of Object.entries(pendingWrites)) {
        const serverVote = votes.find(row => row.entry_id === entryId && row.scorer_member_id === currentMemberId);
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
    const done = answerCards.filter(card => myScores[card.entryId] !== null).length;
    document.getElementById('progress-text').textContent = `${done} / ${total} 件`;

    if (grid.children.length === answerCards.length && grid.children[0]?.className?.includes('answer-card')) {
        answerCards.forEach((cardData, idx) => {
            const myScore = myScores[cardData.entryId];
            const card = grid.children[idx];
            updateAnswerCardClass(card, myScore, idx === selectedIndex);
        });
    } else {
        grid.textContent = '';
        answerCards.forEach((cardData, idx) => {
            grid.appendChild(createAnswerCard(cardData, idx));
        });
    }

    scrollToSelected();
}

async function mark(entryId, result) {
    pendingWrites[entryId] = result;
    myScores[entryId] = result;
    renderGrid();
    try {
        await CIQSupabaseAPI.setScoreVote(projectId, currentQ, entryId, result);
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
    cards.forEach((card, i) => card.classList.toggle('selected', i === selectedIndex));
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
