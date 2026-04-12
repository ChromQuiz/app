
const auth = requireAuth();
const { projectId, secretHash, scorerName } = auth || {};
if (!auth) throw new Error('auth');
const currentQ = parseInt(localStorage.getItem('current_q') || '1');

        document.getElementById('q-badge').textContent = `${currentQ} 問`;

        let answers = {};
        let myScores = {};
        let entryNumbers = [];
        let isCompleted = false;
        let selectedIndex = 0;

        async function init() {
            // 模範解答と答案キーを並列取得
            const [answerSnap] = await Promise.all([
                db.ref(`projects/${projectId}/protected/${secretHash}/answers_text/${currentQ}`).get(),
                fetch(`${FIREBASE_REST_BASE}/projects/${projectId}/protected/${secretHash}/answers.json?shallow=true`)
                    .then(r => r.json())
                    .then(data => { if (data) entryNumbers = Object.keys(data).map(Number).sort((a, b) => a - b); })
                    .catch(e => console.error('答案キー取得エラー:', e))
            ]);
            const answerText = answerSnap.exists() ? answerSnap.val() : '未設定';
            document.getElementById('answer-badge').textContent = answerText;

            if (entryNumbers.length === 0) {
                document.getElementById('answer-grid').innerHTML = '<div class="loading">答案データがありません</div>';
                return;
            }

            // 現在の設問の画像のみを並列取得 (100倍高速化)
            const fetchPromises = entryNumbers.map(async (entryNum) => {
                const imgSnap = await db.ref(`projects/${projectId}/protected/${secretHash}/answers/${entryNum}/cells/q${currentQ}`).get();
                if (!answers[entryNum]) answers[entryNum] = { cells: {} };
                answers[entryNum].cells[`q${currentQ}`] = imgSnap.val();
            });
            await Promise.all(fetchPromises);

            // 採点者として登録
            await db.ref(`projects/${projectId}/protected/${secretHash}/scores/__scorers__q${currentQ}/${scorerName}`).set(true);

            // スコアのリアルタイム監視
            db.ref(`projects/${projectId}/protected/${secretHash}/scores`).on('value', snap => {
                const allScores = snap.val() || {};
                myScores = {};
                entryNumbers.forEach(entryNum => {
                    myScores[entryNum] = allScores[entryNum]?.[`q${currentQ}`]?.[scorerName] || null;
                });
                isCompleted = allScores[`__completed__q${currentQ}`]?.[scorerName] === true;
                renderGrid();
                checkAutoCompletion();
            });
        }

        function renderGrid() {
            const grid = document.getElementById('answer-grid');
            if (selectedIndex >= entryNumbers.length) selectedIndex = Math.max(0, entryNumbers.length - 1);

            const total = entryNumbers.length;
            const done = entryNumbers.filter(n => myScores[n] !== null).length;
            document.getElementById('progress-text').textContent = `${done} / ${total} 件`;

            let masterData = getMasterData(projectId);

            // DOMを毎度作り直すと画像がチラつくため、既に要素があればクラスのみ更新
            if (grid.children.length === entryNumbers.length && grid.children[0].className.includes('answer-card')) {
                entryNumbers.forEach((entryNum, idx) => {
                    const myScore = myScores[entryNum];
                    const card = grid.children[idx];
                    card.className = `answer-card ${myScore === 'correct' ? 'correct' : myScore === 'wrong' ? 'wrong' : myScore === 'hold' ? 'hold' : ''} ${idx === selectedIndex ? 'selected' : ''}`;
                });
            } else {
                grid.innerHTML = '';
                entryNumbers.forEach((entryNum, idx) => {
                    const imageData = answers[entryNum]?.cells[`q${currentQ}`];
                    const myScore = myScores[entryNum];
                    const displayName = masterData[entryNum]?.name || `受付番号 ${entryNum}`;

                    const card = document.createElement('div');
                    card.className = `answer-card ${myScore === 'correct' ? 'correct' : myScore === 'wrong' ? 'wrong' : myScore === 'hold' ? 'hold' : ''} ${idx === selectedIndex ? 'selected' : ''}`;
                    card.innerHTML = `
              <img src="${imageData || ''}" alt="${displayName}" loading="lazy" />
              <div class="entry-num">${displayName}</div>
            `;
                    card.addEventListener('click', () => selectCard(idx));
                    card.addEventListener('dblclick', () => showPreview(projectId, secretHash, entryNum));
                    grid.appendChild(card);
                });
            }

            scrollToSelected();
        }

        function mark(entryNum, result) {
            db.ref(`projects/${projectId}/protected/${secretHash}/scores/${entryNum}/q${currentQ}/${scorerName}`).set(result);
        }

        function selectCard(idx) {
            if (idx < 0 || idx >= entryNumbers.length) return;
            selectedIndex = idx;
            const cards = document.querySelectorAll('.answer-card');
            cards.forEach((card, i) => card.classList.toggle('selected', i === selectedIndex));
            scrollToSelected();
        }

        function advanceSelection() {
            if (selectedIndex < entryNumbers.length - 1) {
                selectCard(selectedIndex + 1);
            }
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

        
        window.scoreSelected = function(status) {
            if (entryNumbers.length === 0) return;
            const entryNum = entryNumbers[selectedIndex];
            
            // UI visual feedback
            const card = Object.values(document.querySelectorAll('.answer-card')).find(el => {
                const badge = el.querySelector('.entry-num');
                return badge && badge.textContent === entryNum;
            });
            
            if (card) {
                card.style.transform = 'scale(1.05)';
                setTimeout(() => card.style.transform = 'scale(1)', 150);
            }

            db.ref(`projects/${projectId}/protected/${secretHash}/scores/${entryNum}/q${currentQ}/${scorerName}`).set(status);

            // 最後の回答でなければ自動で次の回答へ移動
            if (selectedIndex < entryNumbers.length - 1) {
                selectedIndex++;
                updateSelection();
            }
        };

        // Re-use logic in keydown
document.addEventListener('keydown', (e) => {
            if (entryNumbers.length === 0) return;
            const key = e.key;
            if (key === 'm' || key === 'M') {
                e.preventDefault();
                const entryNum = entryNumbers[selectedIndex];
                if (entryNum !== undefined) {
                    mark(entryNum, 'correct');
                    advanceSelection();
                }
            } else if (key === 'x' || key === 'X') {
                e.preventDefault();
                const entryNum = entryNumbers[selectedIndex];
                if (entryNum !== undefined) {
                    mark(entryNum, 'wrong');
                    advanceSelection();
                }
            } else if (key === 'h' || key === 'H') {
                e.preventDefault();
                const entryNum = entryNumbers[selectedIndex];
                if (entryNum !== undefined) {
                    mark(entryNum, 'hold');
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
            const total = entryNumbers.length;
            const done = entryNumbers.filter(n => myScores[n] !== null).length;
            const allDone = done === total && total > 0;

            document.getElementById('progress-text').textContent = `${done} / ${total} 件`;

            if (allDone && !isCompleted) {
                isCompleted = true; // 重複実行ブロック
                await db.ref(`projects/${projectId}/protected/${secretHash}/scores/__completed__q${currentQ}/${scorerName}`).set(true);

                const snap = await db.ref(`projects/${projectId}/protected/${secretHash}/scores`).get();
                await checkAutoConfirm(snap.val() || {}, currentQ);
                
                location.href = 'judge.html';
            }
        }

        async function checkAutoConfirm(allScores, q) {
            const completedScorers = Object.keys(allScores[`__completed__q${q}`] || {});
            if (completedScorers.length < 3) return;

            const entryNums = Object.keys(allScores)
                .filter(k => !k.startsWith('__'))
                .map(Number);

            const finals = {};
            let allAgree = true;

            for (const entryNum of entryNums) {
                const qScores = allScores[entryNum]?.[`q${q}`] || {};
                const vals = Object.values(qScores);
                const corrects = vals.filter(v => v === 'correct').length;
                const wrongs = vals.filter(v => v === 'wrong').length;

                // 3票完全一致のみ自動確定。それ以外はコンフリクト（管理者判断待ち）
                if (corrects === 3) {
                    finals[entryNum] = 'correct';
                } else if (wrongs === 3) {
                    finals[entryNum] = 'wrong';
                } else {
                    // 意見が割れている → 自動確定しない
                    allAgree = false;
                    break;
                }
            }

            if (allAgree) {
                await db.ref(`projects/${projectId}/protected/${secretHash}/scores/__final__q${q}`).set(finals);
            }
        }


        init();