const projectId = session.projectId;
        const secretHash = session.get("secretHash");
        const scorerRole = session.scorerRole;
        if (!projectId || scorerRole !== 'admin') {
            alert('管理者としてプロジェクトに入室してください');
            location.href = 'index.html';
        }

        let answersData = {};
        let answersText = {};
        let scoresData = {};
        let entryNumbers = [];
        let selectedIndex = 0;
        let currentConflicts = [];

        let totalQuestions = 100;

        async function init() {
            const configSnap = await db.ref(`projects/${projectId}/protected/${secretHash}/config`).once('value');
            if(configSnap.exists()) {
                totalQuestions = configSnap.val().questionCount || 100;
            }

            try {
                const res = await fetch(`https://ciq-saiten-default-rtdb.asia-southeast1.firebasedatabase.app/projects/${projectId}/answers.json?shallow=true`);
                const data = await res.json();
                if (data) entryNumbers = Object.keys(data).map(Number).sort((a, b) => a - b);
            } catch(e) {
                const answersSnap = await db.ref(`projects/${projectId}/protected/${secretHash}/answers`).get();
                if (answersSnap.exists()) {
                    answersData = answersSnap.val();
                    entryNumbers = Object.keys(answersData).map(Number).sort((a, b) => a - b);
                }
            }

            const answersTextSnap = await db.ref(`projects/${projectId}/protected/${secretHash}/answers_text`).get();
            if (answersTextSnap.exists()) {
                answersText = answersTextSnap.val();
            }

            db.ref(`projects/${projectId}/protected/${secretHash}/scores`).on('value', snap => {
                scoresData = snap.val() || {};
                render();
            });
        }

        function render() {
            const conflicts = [];

            for (let q = 1; q <= totalQuestions; q++) {
                const completedScorers = Object.keys(scoresData[`__completed__q${q}`] || {});
                if (completedScorers.length < 3) continue;

                entryNumbers.forEach(entryNum => {
                    const qScores = scoresData[entryNum]?.[`q${q}`] || {};
                    const entries = Object.entries(qScores);
                    const corrects = entries.filter(([, v]) => v === 'correct').length;
                    const wrongs = entries.filter(([, v]) => v === 'wrong').length;
                    const holds = entries.filter(([, v]) => v === 'hold').length;

                    if ((corrects > 0 && wrongs > 0) || holds > 0) {
                        const finalResult = scoresData[`__final__q${q}`]?.[entryNum];
                        conflicts.push({ q, entryNum, qScores, finalResult });
                    }
                });
            }

            // 画像の必要部分だけダイナミックに一括取得
            const promises = conflicts.map(async c => {
                if (!answersData[c.entryNum]) answersData[c.entryNum] = { cells: {} };
                if (answersData[c.entryNum].cells[`q${c.q}`] === undefined) {
                    const snap = await db.ref(`projects/${projectId}/protected/${secretHash}/answers/${c.entryNum}/cells/q${c.q}`).get();
                    answersData[c.entryNum].cells[`q${c.q}`] = snap.val() || null;
                }
            });
            Promise.all(promises).then(() => {

            currentConflicts = conflicts;
            if (selectedIndex >= conflicts.length) selectedIndex = Math.max(0, conflicts.length - 1);

            const unresolvedCount = conflicts.filter(c => !c.finalResult).length;
            document.getElementById('counter').textContent =
                `未確定 ${unresolvedCount}件 / 全${conflicts.length}件`;

            const grid = document.getElementById('conflict-grid');

            if (conflicts.length === 0) {
                grid.innerHTML = '<div class="no-conflict"><i class="fa-solid fa-check"></i> 要確認はありません</div>';
                return;
            }

            grid.innerHTML = '';

            let masterData = {};
            try { masterData = JSON.parse(localStorage.getItem('masterData') || '{}'); } catch(e) {}

            conflicts.forEach(({ q, entryNum, qScores, finalResult }, idx) => {
                const imageData = answersData[entryNum]?.cells[`q${q}`];
                const modelAnswer = answersText[q] || '';
                const displayName = masterData[entryNum]?.name || `受付番号 ${entryNum}`;

                const card = document.createElement('div');
                card.className = `conflict-card ${finalResult ? 'resolved' : ''} ${idx === selectedIndex ? 'selected' : ''}`;

                const votesHtml = Object.entries(qScores).map(([name, val]) => {
                    let voteText = '';
                    let voteClass = '';
                    if (val === 'correct') { voteText = '○'; voteClass = 'vote-correct'; }
                    else if (val === 'wrong') { voteText = '×'; voteClass = 'vote-wrong'; }
                    else if (val === 'hold') { voteText = '△'; voteClass = 'vote-hold'; }
                    return `
          <div class="vote-item">
            <span>${name}</span>
            <span class="${voteClass}">
              ${voteText}
            </span>
          </div>`;
                }).join('');

                card.innerHTML = `
          <div class="card-header">
            <div class="q-tag">${q}問</div>
            <div class="entry-tag">${displayName}</div>
          </div>
          <img class="answer-img" src="${imageData || ''}" alt="${displayName} ${q}問" loading="lazy" />
          ${modelAnswer ? `<div class="model-answer">${modelAnswer}</div>` : ''}
          <div class="scorer-votes">${votesHtml}</div>
          ${finalResult ? `<div class="final-result ${finalResult}">判定: ${finalResult === 'correct' ? '○' : '×'}</div>` : ''}
        `;
                card.addEventListener('click', () => selectConflictCard(idx));
                card.addEventListener('dblclick', () => showPreview(entryNum));
                grid.appendChild(card);
            });

            scrollToSelectedConflict();
            }); // End of Promise.all
        }

        async function setFinal(q, entryNum, result) {
            await db.ref(`projects/${projectId}/protected/${secretHash}/scores/__final__q${q}/${entryNum}`).set(result);
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
                    setFinal(conflict.q, conflict.entryNum, 'correct');
                    advanceConflictSelection();
                }
            } else if (key === 'x' || key === 'X') {
                e.preventDefault();
                const conflict = currentConflicts[selectedIndex];
                if (conflict) {
                    setFinal(conflict.q, conflict.entryNum, 'wrong');
                    advanceConflictSelection();
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
        async function showPreview(entryNum) {
            let overlay = document.getElementById('preview-overlay');
            if (!overlay) { overlay = document.createElement('div'); overlay.id = 'preview-overlay'; overlay.className = 'preview-overlay'; document.body.appendChild(overlay); }
            let masterData = {}; try { masterData = JSON.parse(localStorage.getItem('masterData')||'{}'); } catch(e) {}
            const name = masterData[entryNum]?.name || `受付番号 ${entryNum}`;
            overlay.innerHTML = `<div class="preview-header"><h2>${name} の解答用紙</h2><button class="preview-close" onclick="document.getElementById('preview-overlay').classList.remove('show')">✕ 閉じる</button></div><div id="preview-content" style="text-align:center"><div style="color:#aaa">読み込み中...</div></div>`;
            overlay.classList.add('show');
            const snap = await db.ref(`projects/${projectId}/protected/${secretHash}/answers/${entryNum}/pageImage`).get();
            const pc = document.getElementById('preview-content');
            if (snap.exists()) {
                pc.innerHTML = `<img src="${snap.val()}" alt="${name}" style="max-width:100%;border-radius:8px;background:white;">`;
            } else { pc.innerHTML = '<div style="color:#aaa">ページ画像が保存されていません。管理画面から答案を再読み込みしてください。</div>'; }
        }
        document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('preview-overlay')?.classList.remove('show'); });