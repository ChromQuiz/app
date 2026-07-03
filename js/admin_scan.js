// admin_scan.js — 答案一覧管理 + 模範解答グリッド
        // 答案一覧
        let entryListData = [];
        function setScanMessage(container, message, options = {}) {
            container.textContent = '';
            const wrapper = document.createElement('div');
            wrapper.className = options.className || 'text-muted-center';
            if (options.icon) {
                const icon = createIcon(options.icon);
                wrapper.appendChild(icon);
            }
            wrapper.appendChild(document.createTextNode(message));
            container.appendChild(wrapper);
        }

        async function loadEntryList() {
            const el = document.getElementById('entry-list');
            setScanMessage(el, '読み込み中...', { className: 'text-muted-loader' });
            try {
                const pages = await CIQSupabaseAPI.listAnswerPages(projectId);
                entryListData = pages.map(page => Number(page.entries?.entry_number)).filter(Boolean).sort((a, b) => a - b);
                entryNumbers = [...entryListData];
                document.getElementById('entry-count-badge').textContent = `${entryListData.length}件`;
                if (entryListData.length === 0) {
                    setScanMessage(el, '保存済み答案はありません', { icon: 'fa-solid fa-box-open icon-empty' });
                    document.getElementById('select-all-label').hidden = true;
                    document.getElementById('batch-delete-btn').hidden = true;
                    return;
                }
                document.getElementById('select-all-label').hidden = false;
                document.getElementById('batch-delete-btn').hidden = false;
                el.textContent = '';
                const grid = document.createElement('div');
                grid.className = 'entry-list-grid';
                pages.forEach(page => {
                    const entry = page.entries || {};
                    const num = Number(entry.entry_number);
                    const displayName = entry.entry_name || `No.${padNum(num)}`;
                    const subText = entry.affiliation || '';
                    const card = document.createElement('div');
                    card.className = 'entry-card';
                    const checkboxLabel = document.createElement('label');
                    checkboxLabel.className = 'custom-checkbox scan-cb-wrap';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'entry-cb';
                    cb.dataset.num = String(num);
                    const mark = document.createElement('span');
                    mark.className = 'checkbox-mark';
                    const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    checkSvg.classList.add('checkbox-svg');
                    checkSvg.setAttribute('viewBox', '0 0 16 16');
                    const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    checkPath.setAttribute('d', 'M3 8.5L6.5 12L13 4');
                    checkSvg.appendChild(checkPath);
                    mark.appendChild(checkSvg);
                    checkboxLabel.append(cb, mark);

                    const entryInfo = document.createElement('div');
                    entryInfo.className = 'entry-info';
                    const nameEl = document.createElement('div');
                    nameEl.className = 'entry-name';
                    nameEl.textContent = displayName;
                    entryInfo.appendChild(nameEl);
                    if (subText) {
                        const subEl = document.createElement('div');
                        subEl.className = 'entry-sub';
                        subEl.textContent = subText;
                        entryInfo.appendChild(subEl);
                    }

                    const badge = document.createElement('span');
                    badge.className = 'entry-num-badge';
                    badge.textContent = `#${padNum(num)}`;
                    card.append(checkboxLabel, entryInfo, badge);
                    cb.addEventListener('change', () => {
                        card.classList.toggle('selected', cb.checked);
                        updateBatchBtn();
                    });
                    card.addEventListener('dblclick', (e) => {
                        if (e.target.closest('.scan-cb-wrap')) return;
                        showEntryPreview(num);
                    });
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('.scan-cb-wrap')) return;
                        showEntryPreview(num);
                    });
                    grid.appendChild(card);
                });
                el.appendChild(grid);
                document.getElementById('batch-delete-btn').disabled = true;
                document.getElementById('select-all-cb').checked = false;
            } catch (e) {
                console.error('Supabase答案リスト読み込みエラー:', e);
                setScanMessage(el, `答案リストを読み込めませんでした: ${e.message}`);
            }
        }

        function updateBatchBtn() {
            const checked = document.querySelectorAll('.entry-cb:checked').length;
            document.getElementById('batch-delete-btn').disabled = checked === 0;
        }
        function toggleSelectAll() {
            const all = document.getElementById('select-all-cb').checked;
            document.querySelectorAll('.entry-cb').forEach(cb => {
                cb.checked = all;
                cb.closest('.entry-card')?.classList.toggle('selected', all);
            });
            updateBatchBtn();
        }
        async function deleteEntry(num, e) {
            e?.stopPropagation();
            if (!(await showConfirm(`受付番号 ${num} の答案を削除しますか？`))) return;
            await CIQSupabaseAPI.deleteAnswerPage(projectId, num);
            loadEntryList();
        }
        async function batchDelete() {
            const checked = [...document.querySelectorAll('.entry-cb:checked')].map(cb => cb.dataset.num);
            if (!checked.length) return;
            if (!(await showConfirm(`${checked.length}件の答案を一括削除しますか？`))) return;
            await Promise.all(checked.map(num => CIQSupabaseAPI.deleteAnswerPage(projectId, Number(num))));
            loadEntryList();
        }

        async function showEntryPreview(num) {
            let overlay = document.getElementById('admin-preview-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'admin-preview-overlay';
                overlay.className = 'preview-overlay';
                document.body.appendChild(overlay);
            }
            const masterData = getMasterData(projectId);
            const name = masterData[num]?.name || `No.${padNum(num)}`;
            overlay.textContent = '';
            const header = document.createElement('div');
            header.className = 'preview-overlay-header';
            const title = document.createElement('h2');
            title.className = 'preview-overlay-title';
            const titleIcon = createIcon('fa-solid fa-file-image');
            title.append(titleIcon, ` ${name} の解答用紙`);
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'btn secondary';
            closeButton.textContent = '✕ 閉じる';
            closeButton.addEventListener('click', () => { overlay.classList.remove('show'); });
            header.append(title, closeButton);
            const content = document.createElement('div');
            content.id = 'admin-preview-content';
            content.className = 'preview-overlay-content';
            setScanMessage(content, '読み込み中...', { className: 'text-muted-loader', icon: 'fa-solid fa-spinner fa-spin' });
            overlay.append(header, content);
            overlay.classList.add('show');
            const pc = document.getElementById('admin-preview-content');
            const page = await CIQSupabaseAPI.getAnswerPageByEntryNumber(projectId, num);
            if (page?.storage_path) {
                const signedUrl = await CIQSupabaseAPI.getAnswerPageUrl(page.storage_path);
                pc.textContent = '';
                const image = document.createElement('img');
                image.src = signedUrl;
                image.alt = name;
                image.className = 'preview-image';
                pc.appendChild(image);
            } else {
                setScanMessage(pc, 'ページ画像が保存されていません。答案を再読み込みしてください。');
            }
        }
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.getElementById('admin-preview-overlay'); if (o) o.classList.remove('show'); }});

        // ============================
        // TAB 3: 模範解答
        // ============================
        let dragSrcIdx = null;
        async function moveModelAnswer(index, direction) {
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= modelAnswers.length) return;
            [modelAnswers[index], modelAnswers[nextIndex]] = [modelAnswers[nextIndex], modelAnswers[index]];
            renderModelGrid();
            await saveModelAnswers();
            showAdminToast('並び替えを保存しました', 'success');
        }
        function renderModelGrid() {
            const grid = document.getElementById('model-answer-grid'); grid.textContent = '';
            modelAnswers.forEach((ans, i) => {
                const item = document.createElement('div'); item.className = 'model-cell';
                item.draggable = true;
                item.dataset.idx = i;
                const label = document.createElement('div');
                label.className = 'q-label';
                const icon = createIcon('fa-solid fa-hashtag');
                label.append(icon, String(i + 1));
                const answer = document.createElement('div');
                answer.className = `q-answer${ans ? '' : ' model-answer-empty'}`;
                answer.textContent = ans || '—';
                const moveControls = document.createElement('div');
                moveControls.className = 'model-move-controls';
                const prevBtn = document.createElement('button');
                prevBtn.type = 'button';
                prevBtn.className = 'model-move-btn';
                prevBtn.title = '前へ移動';
                prevBtn.disabled = i === 0;
                const prevIcon = createIcon('fa-solid fa-chevron-left');
                prevBtn.appendChild(prevIcon);
                const nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.className = 'model-move-btn';
                nextBtn.title = '後ろへ移動';
                nextBtn.disabled = i === modelAnswers.length - 1;
                const nextIcon = createIcon('fa-solid fa-chevron-right');
                nextBtn.appendChild(nextIcon);
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveModelAnswer(i, -1);
                });
                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveModelAnswer(i, 1);
                });
                moveControls.append(prevBtn, nextBtn);
                item.append(label, answer, moveControls);

                // ドラッグ開始
                item.addEventListener('dragstart', e => {
                    dragSrcIdx = i;
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => item.classList.add('dragging'), 0);
                });
                item.addEventListener('dragend', async () => { 
                    item.classList.remove('dragging');
                    item.classList.remove('drag-over');
                    
                    // Rebuild array from current DOM order to persist changes
                    const newAnswers = [];
                    grid.querySelectorAll('.model-cell').forEach(cell => {
                        const originalIdx = parseInt(cell.dataset.idx, 10);
                        newAnswers.push(modelAnswers[originalIdx]);
                    });
                    
                    let changed = false;
                    for (let j = 0; j < modelAnswers.length; j++) {
                        if (modelAnswers[j] !== newAnswers[j]) changed = true;
                    }

                    if (changed) {
                        modelAnswers.splice(0, modelAnswers.length, ...newAnswers);
                        renderModelGrid(); // Re-render to fix the # numbers
                        await saveModelAnswers();
                        showAdminToast('並び替えを保存しました', 'success');
                    } else {
                        renderModelGrid(); // reset DOM
                    }
                });

                // ドロップ先へのドラッグ中の動的並び替え (Live sorting)
                item.addEventListener('dragenter', e => {
                    e.preventDefault();
                    const draggingItem = grid.querySelector('.dragging');
                    if (draggingItem && draggingItem !== item) {
                        const allItems = [...grid.querySelectorAll('.model-cell')];
                        const currPos = allItems.indexOf(draggingItem);
                        const tgtPos = allItems.indexOf(item);
                        if (currPos < tgtPos) {
                            item.after(draggingItem);
                        } else {
                            grid.insertBefore(draggingItem, item);
                        }
                    }
                });
                item.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
                // drop時の固有処理はdragendに統合したため不要
                item.addEventListener('drop', e => e.preventDefault());

                // クリックで編集
                item.addEventListener('click', () => {
                    if (item.querySelector('input')) return;
                    const ansDiv = item.querySelector('.q-answer');
                    const current = modelAnswers[i] || '';
                    ansDiv.textContent = '';
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = current;
                    input.className = 'inline-edit-input';
                    ansDiv.appendChild(input);
                    item.draggable = false; // 編集中はドラッグ無効
                    input.focus();
                    input.select();
                    let canceled = false;
                    const save = async () => {
                        if (canceled) return;
                        const newVal = input.value.trim();
                        modelAnswers[i] = newVal;
                        ansDiv.classList.toggle('model-answer-empty', !newVal);
                        ansDiv.textContent = newVal || '—';
                        item.draggable = true;
                        await saveModelAnswers();
                    };
                    input.addEventListener('blur', save);
                    input.addEventListener('keydown', e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            input.blur();
                        }
                        if (e.key === 'Escape') {
                            canceled = true;
                            ansDiv.classList.toggle('model-answer-empty', !current);
                            ansDiv.textContent = current || '—';
                            item.draggable = true;
                        }
                    });
                });
                grid.appendChild(item);
            });
        }
        function loadCSV() {
            const file = document.getElementById('csv-file').files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async e => {
                const lines = e.target.result.split('\n').filter(l => l.trim());
                modelAnswers = new Array(totalQuestions).fill('');
                lines.forEach((line, idx) => {
                    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                    if (cols.length >= 2 && !isNaN(parseInt(cols[0]))) { const q = parseInt(cols[0]); if (q >= 1 && q <= totalQuestions) modelAnswers[q - 1] = cols[1]; }
                    else if (idx < totalQuestions) modelAnswers[idx] = cols[0];
                });
                renderModelGrid();
                showAdminToast(`${lines.length}件読み込み中...`);
                await saveModelAnswers();
                showAdminToast(`${lines.length}件の模範解答を保存しました`, 'success');
            };
            reader.readAsText(file, 'UTF-8');
        }
        async function saveModelAnswers() {
            try {
                await CIQSupabaseAPI.saveModelAnswers(projectId, modelAnswers);
            } catch(e) {
                showAdminToast('保存に失敗: ' + e.message);
            }
        }

        // ============================
        // TAB 4: 集計・設定
