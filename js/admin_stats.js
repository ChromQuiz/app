// admin_stats.js — 集計・分析・成績照会
        // ============================
        function adminStatsIcon(className) {
            const icon = createIcon(className);
            return icon;
        }

        function setCsvStatus(el, className, iconClass, text) {
            el.textContent = '';
            el.className = `csv-status ${className}`;
            el.append(adminStatsIcon(iconClass), ` ${text}`);
        }

        function addProgressWidthClass(el, percent) {
            const rounded = Math.max(5, Math.min(100, Math.round(percent / 5) * 5));
            el.classList.add(`progress-p-${rounded}`);
        }

        function setAnalyticsMessage(tbody, message) {
            tbody.textContent = '';
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.className = 'td-loading';
            td.textContent = message;
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        function appendAnalyticsCell(row, text) {
            const td = document.createElement('td');
            td.textContent = text;
            row.appendChild(td);
        }

        async function updateStatsView() {
            try {
                await refreshSupabaseScoringData();
            } catch (e) {
                showAdminToast('集計データの読み込みに失敗しました: ' + e.message);
            }
            let confirmedCount = 0, doneCount = 0, conflictCount = 0, inprogressCount = 0, untouchedCount = 0, allConfirmed = true;
            for (let q = 1; q <= totalQuestions; q++) {
                const cs = Object.keys(scoresData[`__completed__q${q}`] || {}); 
                const reqS = requiredScorers || 3;
                const allDone = cs.length >= reqS; 
                let hasConflict = false, allResolved = true;
                
                if (allDone) { 
                    entryNumbers.forEach(en => { 
                        const qs = scoresData[en]?.[`q${q}`] || {}; 
                        const v = Object.values(qs); 
                        const co = v.filter(x => x === 'correct').length, 
                              wr = v.filter(x => x === 'wrong').length; 
                        if (co !== reqS && wr !== reqS) { 
                            hasConflict = true; 
                            if (!scoresData[`__final__q${q}`]?.[en]) allResolved = false; 
                        } 
                    }); 
                }
                
                const fc = allDone && (!hasConflict || allResolved); 
                
                if (fc) { 
                    confirmedCount++; 
                } else if (hasConflict) { 
                    conflictCount++; allConfirmed = false; 
                } else if (allDone) { 
                    doneCount++; allConfirmed = false; 
                } else if (cs.length > 0) { 
                    inprogressCount++; allConfirmed = false; 
                } else { 
                    untouchedCount++; allConfirmed = false; 
                }
            }
            // 表示上は confirmedCount と doneCount をマージして「完了」とする
            const visualDoneCount = confirmedCount + doneCount;
            document.getElementById('stat-done').textContent = visualDoneCount; 
            document.getElementById('stat-conflict').textContent = conflictCount; 
            
            // Progress bar
            const bar = document.getElementById('stats-bar');
            const t = totalQuestions || 1;
            bar.textContent = '';
            const segs = [
                { cls: 'confirmed', count: visualDoneCount, label: `${visualDoneCount}` },
                { cls: 'conflict', count: conflictCount, label: `${conflictCount}` },
                { cls: 'inprogress', count: inprogressCount, label: `${inprogressCount}` },
                { cls: 'untouched', count: untouchedCount, label: `${untouchedCount}` },
            ];
            segs.forEach(s => {
                if (s.count === 0) return;
                const seg = document.createElement('div');
                seg.className = `stats-bar-seg ${s.cls}`;
                addProgressWidthClass(seg, (s.count / t) * 100);
                if (s.count / t >= 0.08) seg.textContent = s.label;
                bar.appendChild(seg);
            });
            
            const csvS = document.getElementById('csv-status'), csvB = document.getElementById('csv-btn');
            // CSV出力の可否は表示用の完了カウントではなく、真の全問確定（allConfirmed）で判定
            if (allConfirmed && totalQuestions > 0) { 
                setCsvStatus(csvS, 'ready', 'fa-solid fa-circle-check', '全問確定済み — CSV出力できます');
                csvB.disabled = false;
                const pdfB = document.getElementById('graded-pdf-btn');
                if (pdfB) pdfB.disabled = false;
            } else { 
                setCsvStatus(csvS, 'notready', 'fa-solid fa-circle-xmark', `未確定の問題があります（${confirmedCount} / ${totalQuestions} 確定済み）`);
                csvB.disabled = true;
                const pdfB2 = document.getElementById('graded-pdf-btn');
                if (pdfB2) pdfB2.disabled = true;
            }
            window.updateAdminOverview?.();
            renderAnalytics();
        }


        // ============================
        // CSV出力（名前フォーマットオプション対応）
        // ============================
        function formatCsvName(familyName, firstName, entryName, useEntryName, sepType, fixedLen) {
            // エントリーネーム使用者はそのまま
            if (useEntryName && entryName) return entryName;

            const sep = sepType === 'fullspace' ? '\u3000' : sepType === 'halfspace' ? ' ' : '';

            if (fixedLen > 0) {
                const totalChars = familyName.length + firstName.length;
                if (totalChars < fixedLen) {
                    // 固定長未満 → 姓名間に全角スペースで埋める
                    const padCount = fixedLen - totalChars;
                    return familyName + '\u3000'.repeat(padCount) + firstName;
                }
                // 固定長以上 → スペースなしでそのまま結合
                return familyName + firstName;
            }
            return familyName + sep + firstName;
        }

        async function exportCSV() {
            const sepType = document.getElementById('csv-name-sep')?.value || 'fullspace';
            const fixedLen = parseInt(document.getElementById('csv-name-fixed')?.value) || 0;

            const entriesData = window._entriesRaw || {};
            let masterData = {};
            if (entriesData) {
                const privJwkStr = session.get('privateKeyJwk');
                let privJwk = null;
                if (privJwkStr) { try { privJwk = JSON.parse(privJwkStr); } catch(e){} }

                for (const v of Object.values(entriesData)) {
                    if (!v.entryNumber) continue;
                    let familyName = '', firstName = '', affiliation = '', grade = '', entryName = '', useEntryName = false;
                    if (v.encryptedPII && privJwk) {
                        try {
                            const jsonStr = await AppCrypto.decryptRSA(v.encryptedPII, privJwk);
                            const pii = JSON.parse(jsonStr);
                            familyName = pii.familyName || '';
                            firstName = pii.firstName || '';
                            affiliation = pii.affiliation || '';
                            grade = pii.grade || '';
                            entryName = pii.entryName || '';
                            useEntryName = !!pii.useEntryName;
                        } catch(e) {}
                    } else {
                        // PII復号不可の場合、公開フィールドのみ使用
                        affiliation = v.affiliation || '';
                        grade = v.grade || '';
                        entryName = v.entryName || '';
                    }
                    masterData[v.entryNumber] = { familyName, firstName, affiliation, grade, entryName, useEntryName };
                }
            }

            const results = entryNumbers.map(en => {
                const answers = []; for (let q = 1; q <= totalQuestions; q++) { const fd = scoresData[`__final__q${q}`] || {}; const r = fd[en] === 'correct' ? 1 : 0; answers.push(r); }
                const score = answers.reduce((a, b) => a + b, 0);
                const streaks = []; let cur = 0;
                answers.forEach(a => { if (a === 1) { cur++; } else { streaks.push(cur); cur = 0; } });
                streaks.push(cur);
                const m = masterData[en] || {};
                const name = formatCsvName(m.familyName || '', m.firstName || '', m.entryName || '', m.useEntryName, sepType, fixedLen);
                return { entryNumber: en, name, affiliation: m.affiliation || '', grade: m.grade || '', score, answers, streaks };
            });

            // ソート: 点数降順 → 連答（第1連答 → 第2連答 → ...）で同点処理
            results.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                // 連答: 第1連答 → 第2連答 → ... の順で比較
                const maxLen = Math.max(a.streaks.length, b.streaks.length);
                for (let i = 0; i < maxLen; i++) {
                    const sa = a.streaks[i] || 0;
                    const sb = b.streaks[i] || 0;
                    if (sa !== sb) return sb - sa;
                }
                return 0;
            });

            // 最大連答数を算出（列数統一用）
            const maxStreakLen = Math.max(...results.map(r => r.streaks.length), 1);
            const streakHeaders = [];
            for (let i = 0; i < maxStreakLen; i++) streakHeaders.push(`連答${i + 1}`);

            const tieKey = r => `${r.score}|${r.streaks.join('/')}`;
            const tieCounts = results.reduce((map, r) => {
                const key = tieKey(r);
                map[key] = (map[key] || 0) + 1;
                return map;
            }, {});

            const headers = ['順位', '完全一致同順位', '同順位人数', '所属', '学年', '氏名', '点数', ...streakHeaders];
            const rows = [headers];
            let currentRank = 1;
            results.forEach((r, idx) => {
                if (idx > 0) {
                    const prev = results[idx - 1];
                    const same = prev.score === r.score && JSON.stringify(prev.streaks) === JSON.stringify(r.streaks);
                    if (!same) currentRank = idx + 1;
                }
                const streakCols = [];
                for (let i = 0; i < maxStreakLen; i++) streakCols.push(r.streaks[i] ?? '');
                const sameCount = tieCounts[tieKey(r)] || 1;
                rows.push([
                    currentRank,
                    sameCount > 1 ? '完全一致' : '',
                    sameCount > 1 ? sameCount : '',
                    r.affiliation,
                    r.grade,
                    `"${r.name.replace(/"/g, '""')}"`,
                    r.score,
                    ...streakCols
                ]);
            });
            const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ciq_result.csv'; a.click();
        }

        async function getAnalyticsData() {
            const threshold = parseInt(document.getElementById('analytics-threshold').value) || 5;
            const masterData = getMasterData(projectId);
            const tp = entryNumbers.length || 1, qStats = [];
            for (let q = 1; q <= totalQuestions; q++) {
                const fd = scoresData[`__final__q${q}`] || {};
                // __final__ が空 = まだ確定していない → 未確定として扱う
                const hasFinal = Object.keys(fd).length > 0;
                if (!hasFinal) {
                    qStats.push({ q, correctCount: '-', rate: '-', type: '未確定', names: '', isRare: false });
                    continue;
                }
                let cc = 0, ce = [];
                entryNumbers.forEach(en => {
                    if (fd[en] === 'correct') { cc++; ce.push(en); }
                });
                const rate = Math.round((cc / tp) * 100);
                const useEntryName = document.getElementById('analytics-name-toggle')?.checked || false;
                const names = (cc <= threshold && cc > 0) ? ce.map(e => {
                    if (useEntryName) {
                        // エントリーネームは entries の entryName フィールドから取得
                        const entryData = window._entriesRaw ? Object.values(window._entriesRaw).find(d => d.entryNumber === e) : null;
                        return entryData?.entryName || `No.${padNum(e)}`;
                    }
                    const m = masterData[e] || {}; return m.name ? `${m.affiliation || ''} ${m.name}`.trim() : `No.${padNum(e)}`;
                }).join(' / ') : '';
                let type = ''; if (cc === 0) type = '全滅'; else if (cc === 1) type = '単独正解'; else if (cc <= threshold) type = '少数正解';
                qStats.push({ q, correctCount: cc, rate, type, names, isRare: cc <= threshold && cc > 0 });
            } return qStats;
        }
        let _lastAnalyticsHash = '';
        async function renderAnalytics() {
            const tbody = document.getElementById('analytics-tbody');
            if (!entryNumbers.length) {
                setAnalyticsMessage(tbody, 'データがありません');
                _lastAnalyticsHash = '';
                return;
            }
            const qs = await getAnalyticsData();
            const hash = qs.map(s => `${s.q}:${s.correctCount}`).join(',');
            if (hash === _lastAnalyticsHash) return;
            _lastAnalyticsHash = hash;
            tbody.textContent = '';
            qs.forEach((s) => {
                const tr = document.createElement('tr');
                if (s.isRare) tr.className = 'row-rare';
                appendAnalyticsCell(tr, s.q);
                appendAnalyticsCell(tr, `${s.correctCount}人`);
                appendAnalyticsCell(tr, `${s.rate}%`);
                appendAnalyticsCell(tr, s.type);
                appendAnalyticsCell(tr, s.names);
                tbody.appendChild(tr);
            });
        }
        async function exportAnalyticsCSV() {
            const qs = await getAnalyticsData(); const headers = ['問題番号', '正答数', '正答率(%)', '状態', '正解者一覧']; const rows = [headers];
            qs.forEach(s => rows.push([s.q, s.correctCount, s.rate, s.type, `"${s.names.replace(/"/g, '""')}"`]));
            const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'analytics_all_qs.csv'; a.click();
        }
