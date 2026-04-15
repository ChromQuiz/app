// admin_stats.js — 集計・分析・成績開示
        // ============================
        function updateStatsView() {
            let confirmedCount = 0, doneCount = 0, conflictCount = 0, inprogressCount = 0, untouchedCount = 0, allConfirmed = true;
            for (let q = 1; q <= totalQuestions; q++) {
                const cs = Object.keys(scoresData[`__completed__q${q}`] || {}); 
                const reqS = parseInt(document.getElementById('required-scorers')?.value) || 3;
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
            const pct = (n) => ((n / t) * 100).toFixed(1) + '%';
            bar.innerHTML = '';
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
                seg.style.width = pct(s.count);
                if (s.count / t >= 0.08) seg.textContent = s.label;
                bar.appendChild(seg);
            });
            
            const csvS = document.getElementById('csv-status'), csvB = document.getElementById('csv-btn');
            // CSV出力の可否は表示用の完了カウントではなく、真の全問確定（allConfirmed）で判定
            if (allConfirmed && totalQuestions > 0) { 
                csvS.textContent = '全問確定済み。CSV出力できます。'; 
                csvS.className = 'csv-status ready'; 
                csvB.disabled = false; 
            } else { 
                csvS.textContent = `未確定の問題があります（確定済み: ${confirmedCount}/${totalQuestions}）`; 
                csvS.className = 'csv-status notready'; 
                csvB.disabled = true; 
            }
            renderAnalytics();
            generateDisclosure();
        }


        // ============================
        // CSV出力（仕様変更: 列順=所属,学年,氏名 / 点数・連答は非出力）
        // ============================
        async function exportCSV() {
            const entriesData = await dbGet(`projects/${projectId}/entries`);
            let masterData = {};
            if (entriesData) {
                const privJwkStr = session.get('privateKeyJwk');
                let privJwk = null;
                if (privJwkStr) { try { privJwk = JSON.parse(privJwkStr); } catch(e){} }

                for (const v of Object.values(entriesData)) {
                    if (!v.entryNumber) continue;
                    let name = '', affiliation = '', grade = '';
                    if (v.encryptedPII && privJwk) {
                        try {
                            const jsonStr = await AppCrypto.decryptRSA(v.encryptedPII, privJwk);
                            const pii = JSON.parse(jsonStr);
                            name = `${pii.familyName} ${pii.firstName}`;
                            affiliation = pii.affiliation || '';
                            grade = pii.grade || '';
                        } catch(e) {}
                    } else {
                        name = v.familyName ? `${v.familyName} ${v.firstName}` : '';
                        affiliation = v.affiliation || '';
                        grade = v.grade || '';
                    }
                    masterData[v.entryNumber] = { name, affiliation, grade };
                }
            }

            const results = entryNumbers.map(en => {
                const answers = []; for (let q = 1; q <= totalQuestions; q++) { const fd = scoresData[`__final__q${q}`] || {}; const r = fd[en] === 'correct' ? 1 : 0; answers.push(r); }
                const score = answers.reduce((a, b) => a + b, 0);
                // 連答計算（ソート用のみ使用、CSVには出力しない）
                const streaks = []; let cur = 0; answers.forEach(a => { if (a === 1) cur++; else { if (cur > 0) streaks.push(cur); cur = 0; } }); if (cur > 0) streaks.push(cur);
                const m = masterData[en] || {}; return { entryNumber: en, name: m.name || '', affiliation: m.affiliation || '', grade: m.grade || '', score, answers, streaks };
            });

            // ソート: 点数降順 → 連答降順
            results.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                for (let i = 0; i < totalQuestions; i++) { const d = b.answers[i] - a.answers[i]; if (d !== 0) return d; }
                return 0;
            });

            // ヘッダー: 所属, 学年, 氏名 のみ（点数・連答は非出力）
            const headers = ['所属', '学年', '氏名'];
            const rows = [headers];
            results.forEach(r => {
                rows.push([r.affiliation, r.grade, r.name]);
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
                        return entryData?.entryName || `番号${e}`;
                    }
                    const m = masterData[e] || {}; return m.name ? `${m.affiliation || ''} ${m.name}`.trim() : `番号${e}`;
                }).join(' / ') : '';
                let type = ''; if (cc === 0) type = '全滅'; else if (cc === 1) type = '単独正解'; else if (cc <= threshold) type = '少数正解';
                qStats.push({ q, correctCount: cc, rate, type, names, isRare: cc <= threshold && cc > 0 });
            } return qStats;
        }
        async function renderAnalytics() {
            const tbody = document.getElementById('analytics-tbody'); if (!entryNumbers.length) { tbody.innerHTML = '<tr><td colspan="5" class="td-loading">データがありません</td></tr>'; return; }
            const qs = await getAnalyticsData();
            tbody.innerHTML = qs.map(s => `<tr class="${s.isRare ? 'row-rare' : ''}"><td >${s.q}</td><td >${s.correctCount}人</td><td >${s.rate}%</td><td >${s.type}</td><td >${s.names}</td></tr>`).join('');
        }
        async function exportAnalyticsCSV() {
            const qs = await getAnalyticsData(); const headers = ['問題番号', '正答数', '正答率(%)', '状態', '正解者一覧']; const rows = [headers];
            qs.forEach(s => rows.push([s.q, s.correctCount, s.rate, s.type, `"${s.names.replace(/"/g, '""')}"`]));
            const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'analytics_all_qs.csv'; a.click();
        }

