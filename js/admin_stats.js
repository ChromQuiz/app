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

        function appendAnalyticsCell(row, text, className = '') {
            const td = document.createElement('td');
            if (className) td.className = className;
            td.textContent = text;
            row.appendChild(td);
            return td;
        }

        // 順位・CSV・アナリティクス・採点済みPDFが対象にする人は、成績照会と同じ「当日受付を済ませた人」だけ。
        // (遅刻の連絡をしただけの人、キャンセル済み・キャンセル待ちの人は入れない。受付が採点のあとになった人は 0 点になる)
        // どのタブを先に開いたかで人数が変わらないよう、使う前にサーバーから取り直す。
        let scoringEntryNumbers = [];
        // 直近に取った、問題ごとの確定の状態。しきい値を変えるだけのときは、これを使って、通信しない
        let lastQuestionConfirmation = null;
        let checkedInWithoutAnswers = [];
        async function refreshScoringEntryNumbers() {
            const rows = await CIQSupabaseAPI.listEntriesForAdmin(projectId);
            if (!window._entriesRaw) {
                window._entriesRaw = Object.fromEntries(rows.map(entry => [entry.id, normalizeSupabaseEntry(entry)]));
            }
            const pages = await CIQSupabaseAPI.listAnswerPages(projectId).catch(() => null);
            const withPages = new Set((pages || []).map(page => page.entry_id));
            // 答案を読み込めなかったときは、「答案なし」と誤って知らせない
            checkedInWithoutAnswers = pages === null ? [] : rows
                .filter(entry => entry.checked_in === true && !withPages.has(entry.id))
                .map(entry => Number(entry.entry_number))
                .filter(Number.isFinite)
                .sort((a, b) => a - b);
            scoringEntryNumbers = rows
                .filter(entry => entry.checked_in === true)
                .map(entry => Number(entry.entry_number))
                .filter(Number.isFinite)
                .sort((a, b) => a - b);
            return scoringEntryNumbers;
        }

        async function updateStatsView() {
            // 要確認(判定がそろわない答案)は、要確認ページと同じデータベースの定義(list_score_conflicts)で数える。
            // 答案のない人や、受付済みでない人を、要確認に数えないため。
            let confirmation = [];
            let dataLoaded = true;
            try {
                // 3つは互いに待たなくてよいので、同時に取る
                const [, , rows] = await Promise.all([
                    refreshScoringEntryNumbers(),
                    refreshSupabaseScoringData(),
                    CIQSupabaseAPI.listQuestionConfirmation(projectId),
                ]);
                confirmation = rows;
                lastQuestionConfirmation = rows;
            } catch (e) {
                dataLoaded = false;   // 読み込めなかったときは、出力を許可しない
                showAdminToast('集計データを読み込めませんでした。（詳細：' + errorDetail(e) + '）');
            }
            // 「確定しているか」は、データベースの1つの定義(list_question_confirmation)だけで決める。
            let confirmedCount = 0, doneCount = 0, conflictCount = 0, inprogressCount = 0, untouchedCount = 0;
            confirmation.forEach((row) => {
                if (row.confirmed) confirmedCount++;
                else if (row.completedScorers >= row.requiredScorers) conflictCount++;
                else if (row.joinedScorers > 0) inprogressCount++;
                else untouchedCount++;
            });
            const allConfirmed = confirmation.length > 0 && confirmedCount === confirmation.length;
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
            const missingNote = document.getElementById('csv-missing-answers');
            if (missingNote) {
                missingNote.hidden = checkedInWithoutAnswers.length === 0;
                const numbers = checkedInWithoutAnswers.map(n => String(n).padStart(3, '0'));
                const shown = numbers.slice(0, 10).join('、');
                missingNote.textContent = numbers.length
                    ? `受付済みで答案がない人が${numbers.length}人います。出力すると全問0点になります。受付番号：${shown}${numbers.length > 10 ? ' ほか' : ''}`
                    : '';
            }
            // CSV出力の可否は表示用の完了カウントではなく、真の全問確定（allConfirmed）で判定
            if (allConfirmed && dataLoaded && totalQuestions > 0) {
                setCsvStatus(csvS, 'ready', 'circle-check', '全問確定済み — CSV出力できます');
                csvB.disabled = false;
                const pdfB = document.getElementById('graded-pdf-btn');
                if (pdfB) pdfB.disabled = false;
            } else { 
                setCsvStatus(csvS, 'notready', 'circle-xmark', dataLoaded
                    ? `未確定の問題があります（${confirmedCount} / ${totalQuestions} 確定済み）`
                    : '集計データを読み込めなかったため、出力できません。結果タブを開き直してください');
                csvB.disabled = true;
                const pdfB2 = document.getElementById('graded-pdf-btn');
                if (pdfB2) pdfB2.disabled = true;
            }
            window.updateAdminOverview?.();
            renderAnalytics();
        }


        // ============================
        // CSV出力
        // ============================
        // 鍵で復号した氏名・所属・学年を受付番号ごとに返す（_entriesRaw が変わるまでキャッシュ）
        let _masterCache = { source: null, key: null, data: null };
        async function loadEntryMaster() {
            const entriesData = window._entriesRaw || {};
            const privJwkStr = projectKeyStore.get();
            if (_masterCache.source === entriesData && _masterCache.key === privJwkStr && _masterCache.data) return _masterCache.data;
            const masterData = {};
            let privJwk = null;
            if (privJwkStr) { try { privJwk = JSON.parse(privJwkStr); } catch(e){} }

            for (const v of Object.values(entriesData)) {
                if (!v.entryNumber) continue;
                let familyName = '', firstName = '', affiliation = '', grade = '';
                if (v.encryptedPII && privJwk) {
                    try {
                        const jsonStr = await AppCrypto.decryptRSA(v.encryptedPII, privJwk);
                        const pii = JSON.parse(jsonStr);
                        familyName = pii.familyName || '';
                        firstName = pii.firstName || '';
                        affiliation = pii.affiliation || '';
                        grade = pii.grade || '';
                    } catch(e) {}
                } else {
                    // PII復号不可の場合、公開フィールドのみ使用
                    affiliation = v.affiliation || '';
                    grade = v.grade || '';
                }
                masterData[v.entryNumber] = { familyName, firstName, affiliation, grade };
            }
            _masterCache = { source: entriesData, key: privJwkStr, data: masterData };
            return masterData;
        }

        // 出力は、ボタンを無効にするだけでなく、出す直前にも、全問が確定しているかを確かめる
        window.assertAllQuestionsConfirmed = async function() {
            let rows;
            try {
                rows = await CIQSupabaseAPI.listQuestionConfirmation(projectId);
            } catch (e) {
                showAdminToast('確定の状態を確認できなかったため、出力できません。（詳細：' + errorDetail(e) + '）');
                return false;
            }
            const pending = rows.filter(row => !row.confirmed).length;
            if (!rows.length || pending > 0) {
                showAdminToast(`未確定の問題が${pending}問あるため、出力できません。`);
                return false;
            }
            return true;
        };

        async function exportCSV() {
            if (!(await assertAllQuestionsConfirmed())) return;
            await Promise.all([refreshScoringEntryNumbers(), refreshSupabaseScoringData()]);
            const masterData = await loadEntryMaster();

            const results = scoringEntryNumbers.map(en => {
                const answers = []; for (let q = 1; q <= totalQuestions; q++) { const fd = scoresData[`__final__q${q}`] || {}; const r = fd[en] === 'correct' ? 1 : 0; answers.push(r); }
                const score = answers.reduce((a, b) => a + b, 0);
                const streaks = []; let cur = 0;
                answers.forEach(a => { if (a === 1) { cur++; } else { streaks.push(cur); cur = 0; } });
                streaks.push(cur);
                const m = masterData[en] || {};
                return { entryNumber: en, familyName: m.familyName || '', firstName: m.firstName || '', affiliation: m.affiliation || '', grade: m.grade || '', score, answers, streaks };
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

            const headers = ['順位', '完全一致同順位', '同順位人数', '所属', '学年', '姓', '名', '点数', ...streakHeaders];
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
                    csvCell(r.affiliation),
                    csvCell(r.grade),
                    csvCell(r.familyName),
                    csvCell(r.firstName),
                    r.score,
                    ...streakCols
                ]);
            });
            const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ciq_result.csv'; a.click();
        }

        // しきい値(「◯人以下をハイライト」)。0 は有効(単独正解・全滅だけを強調したくない場合など)。空や不正な値のときだけ既定の5。
        function readAnalyticsThreshold() {
            const value = parseInt(document.getElementById('analytics-threshold').value, 10);
            return Number.isFinite(value) && value >= 0 ? value : 5;
        }

        // 受付番号 → 氏名(姓名のみ)。表示に要る人だけ、鍵で復号して、覚えておく。
        // 鍵がないとき・復号できないときは、覚えない(あとで鍵が使えるようになったら、取り直す)。
        const _entryNameCache = new Map();
        async function lookupEntryNames(numbers) {
            const byNumber = new Map(Object.values(window._entriesRaw || {}).map(v => [Number(v.entryNumber), v]));
            const privJwkStr = projectKeyStore.get();
            let privJwk = null;
            if (privJwkStr) { try { privJwk = JSON.parse(privJwkStr); } catch (e) { /* 鍵が読めない */ } }
            const result = new Map();
            await Promise.all(numbers.map(async (en) => {
                if (_entryNameCache.has(en)) { result.set(en, _entryNameCache.get(en)); return; }
                const entry = byNumber.get(en);
                if (!entry?.encryptedPII || !privJwk) return;
                try {
                    const pii = JSON.parse(await AppCrypto.decryptRSA(entry.encryptedPII, privJwk));
                    const name = `${pii.familyName || ''}${pii.firstName || ''}`;
                    _entryNameCache.set(en, name);
                    result.set(en, name);
                } catch (e) { /* 復号できない: 番号で出す */ }
            }));
            return result;
        }

        async function getAnalyticsData() {
            const threshold = readAnalyticsThreshold();
            const tp = scoringEntryNumbers.length || 1, qStats = [];
            const namesNeeded = new Set();
            // 確定しているかは、データベースの1つの定義で決める(要確認が1件でも残っている問題は未確定)
            const confirmation = lastQuestionConfirmation || (lastQuestionConfirmation = await CIQSupabaseAPI.listQuestionConfirmation(projectId));
            const confirmedQuestions = new Set(confirmation.filter(row => row.confirmed).map(row => row.questionNumber));
            for (let q = 1; q <= totalQuestions; q++) {
                const fd = scoresData[`__final__q${q}`] || {};
                if (!confirmedQuestions.has(q)) {
                    qStats.push({ q, correctCount: '-', rate: '-', type: '未確定', names: '', isRare: false });
                    continue;
                }
                let cc = 0, ce = [];
                scoringEntryNumbers.forEach(en => {
                    if (fd[en] === 'correct') { cc++; ce.push(en); }
                });
                const rate = Math.round((cc / tp) * 100);
                const wantNames = cc <= threshold && cc > 0;
                if (wantNames) ce.forEach(e => namesNeeded.add(e));
                let type = '通常'; if (cc === 0) type = '全滅'; else if (cc === 1) type = '単独正解'; else if (cc <= threshold) type = '少数正解';
                qStats.push({ q, correctCount: cc, rate, type, entries: wantNames ? ce : [], isRare: wantNames });
            }
            // 正解者の氏名は、表示する人(しきい値以下の問題の正解者)だけ復号する(全員を復号すると遅い)
            const nameCache = await lookupEntryNames([...namesNeeded]);
            qStats.forEach((stat) => {
                stat.names = (stat.entries || []).map(e => nameCache.get(e) || `No.${padNum(e)}`).join(' / ');
            });
            return qStats;
        }
        let _lastAnalyticsHash = '';
        // 状態ごとに、バッジの色を変える(未確定は、要確認と同じ黄色。通常は目立たせない)
        const ANALYTICS_TYPE_BADGE = {
            '通常': 'muted',
            '未確定': 'warning',
            '少数正解': 'accent',
            '単独正解': 'success',
            '全滅': 'danger',
        };

        async function renderAnalytics() {
            const tbody = document.getElementById('analytics-tbody');
            if (!scoringEntryNumbers.length) {
                setAnalyticsMessage(tbody, 'データがありません。');
                _lastAnalyticsHash = '';
                return;
            }
            const qs = await getAnalyticsData();
            // しきい値が変わると、ハイライトや「少数正解」・正解者の表示が変わるので、再描画の判定に含める
            const hash = `${readAnalyticsThreshold()}|` + qs.map(s => `${s.q}:${s.correctCount}:${s.type}:${s.names}`).join(',');
            if (hash === _lastAnalyticsHash) return;
            _lastAnalyticsHash = hash;
            tbody.textContent = '';
            qs.forEach((s) => {
                const tr = document.createElement('tr');
                if (s.isRare) tr.className = 'row-rare';
                appendAnalyticsCell(tr, s.q, 'analytics-q');
                appendAnalyticsCell(tr, `${s.correctCount}人`, 'analytics-count');
                appendAnalyticsCell(tr, `${s.rate}%`, 'analytics-rate');
                // 状態は、ほかの表と同じく、バッジで見せる（ハイライトする行は、警告の色）
                const typeTd = appendAnalyticsCell(tr, '', 'analytics-type');
                const typeBadge = document.createElement('span');
                typeBadge.className = `badge ${ANALYTICS_TYPE_BADGE[s.type] || 'muted'}`.trim();
                typeBadge.textContent = s.type;
                typeTd.appendChild(typeBadge);
                appendAnalyticsCell(tr, s.names, 'analytics-names');
                tbody.appendChild(tr);
            });
        }
        async function exportAnalyticsCSV() {
            lastQuestionConfirmation = null;   // 出すときは、最新の状態で
            await Promise.all([refreshScoringEntryNumbers(), refreshSupabaseScoringData()]);
            const qs = await getAnalyticsData(); const headers = ['問題番号', '正答数', '正答率', '状態', '正解者一覧']; const rows = [headers];
            qs.forEach(s => rows.push([s.q, s.correctCount, typeof s.rate === 'number' ? `${s.rate}%` : s.rate, s.type, csvCell(s.names)]));
            const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'analytics_all_qs.csv'; a.click();
        }
