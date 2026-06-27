
        // showAdminToast は shared.js の showToast に委譲
        function showAdminToast(msg, type = 'error') {
            showToast(msg, type);
        }
        // showConfirm は shared.js で定義済み

        // ============================
        // 共通初期化
        // ============================
        const auth = requireAuth({ requireAdmin: true });
        if (!auth) throw new Error('auth');
        const { projectId, secretHash } = auth;
        const isSupabaseMode = auth.supabaseMode === true;
        const adminHash = session.get('adminHash');

        function adminIcon(className) {
            const icon = document.createElement('i');
            icon.className = className;
            return icon;
        }

        function setIconOnlyButton(btn, iconClass) {
            if (!btn) return;
            btn.textContent = '';
            btn.appendChild(adminIcon(iconClass));
        }

        const projectIdDisplay = document.getElementById('project-id-display');
        if (projectIdDisplay) {
            projectIdDisplay.textContent = '';
            projectIdDisplay.append(adminIcon('fa-solid fa-copy'), ` ${projectId}`);
        }
        const menuName = document.getElementById('menu-scorer-name');
        if (menuName) menuName.textContent = auth.scorerName;

        function copyProjectId() {
            const el = document.getElementById('project-id-display');
            navigator.clipboard.writeText(projectId).then(() => {
                el.querySelector('i').className = 'fa-solid fa-check';
                el.querySelector('i').style.color = 'var(--success)';
                setTimeout(() => {
                    el.querySelector('i').className = 'fa-solid fa-copy';
                    el.querySelector('i').style.color = '';
                }, 1500);
            });
        }

        function openProjectPage(page) {
            window.open(`${page}?pid=${encodeURIComponent(projectId)}`, '_blank');
        }

        function openLinkById(linkId) {
            const href = document.getElementById(linkId)?.href;
            if (href) window.open(href, '_blank');
        }

        function setupAdminEventHandlers() {
            document.getElementById('project-id-display')?.addEventListener('click', copyProjectId);
            document.querySelectorAll('[data-toggle-menu]').forEach((el) => {
                el.addEventListener('click', toggleMenu);
            });
            document.querySelectorAll('[data-nav-target]').forEach((el) => {
                el.addEventListener('click', () => {
                    location.href = el.dataset.navTarget;
                });
            });
            document.querySelectorAll('[data-open-page]').forEach((el) => {
                el.addEventListener('click', () => openProjectPage(el.dataset.openPage));
            });
            document.querySelectorAll('[data-open-static]').forEach((el) => {
                el.addEventListener('click', () => window.open(el.dataset.openStatic, '_blank'));
            });
            document.querySelectorAll('[data-open-link]').forEach((el) => {
                el.addEventListener('click', () => openLinkById(el.dataset.openLink));
            });
            document.querySelectorAll('[data-copy-link]').forEach((el) => {
                el.addEventListener('click', () => copyUrl(el.dataset.copyLink, el));
            });
            document.querySelectorAll('[data-tab-target]').forEach((el) => {
                el.addEventListener('click', () => switchTab(el.dataset.tabTarget));
            });
            document.getElementById('admin-logout-btn')?.addEventListener('click', logout);
        }

        function setupPublicLinks() {
            const baseUrl = new URL('.', window.location.href).href;
            const links = {
                'entry-link': 'entry_list.html',
                'edit-link': 'edit.html',
                'registration-link': 'entry.html',
                'cancel-link': 'cancel.html',
                'late-link': 'late.html',
                'disclosure-link': 'disclosure.html',
            };

            Object.entries(links).forEach(([id, page]) => {
                const el = document.getElementById(id);
                if (!el) return;
                const url = `${baseUrl}${page}?pid=${encodeURIComponent(projectId)}`;
                el.href = url;
                el.textContent = url;
            });
        }

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }

        window.copyUrl = function(linkId, btn) {
            const url = document.getElementById(linkId)?.href;
            if (!url) return;
            const originalNodes = [...btn.childNodes].map(node => node.cloneNode(true));
            function onSuccess() {
                setIconOnlyButton(btn, 'fa-solid fa-check');
                btn.style.background = 'var(--success)';
                btn.style.color = '#ffffff';
                setTimeout(() => {
                    btn.textContent = '';
                    btn.append(...originalNodes.map(node => node.cloneNode(true)));
                    btn.style.background = '';
                    btn.style.color = '';
                }, 1500);
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(onSuccess).catch(() => {
                    fallbackCopy(url);
                    onSuccess();
                });
            } else {
                fallbackCopy(url);
                onSuccess();
            }
        };

        function registerAdminShortcuts() {
            KeyboardShortcuts.register('1', '参加者タブ', () => switchTab('tab-entries'));
            KeyboardShortcuts.register('2', '採点準備タブ', () => switchTab('tab-prep'));
            KeyboardShortcuts.register('3', '答案管理タブ', () => switchTab('tab-scan'));
            KeyboardShortcuts.register('4', '集計タブ', () => switchTab('tab-stats'));
            KeyboardShortcuts.register('5', '設定タブ', () => switchTab('tab-settings'));
        }



        let totalQuestions = 100;
        let scoresData = {};
        let entryNumbers = [];
        let modelAnswers = [];
        let adminEntriesCount = 0;
        let adminProjectName = '';
        let adminReplyTo = null;
        let requiredScorers = 3;

        function toLocalInputValue(isoValue) {
            if (!isoValue) return '';
            const d = new Date(isoValue);
            if (Number.isNaN(d.getTime())) return '';
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }

        function normalizeSupabaseEntry(row) {
            return {
                ...row,
                entryNumber: row.entry_number,
                encryptedPII: row.encrypted_pii,
                emailHash: row.email_hash,
                entryName: row.entry_name,
                isChubu: row.is_chubu,
                checkedIn: row.checked_in,
                waitlistPromotedAt: row.waitlist_promoted_at,
                waitlistPromotionNotice: row.waitlist_promotion_notice,
            };
        }

        async function refreshSupabaseScoringData() {
            if (!isSupabaseMode) return;
            const [votes, finals, scorers] = await Promise.all([
                CIQSupabaseAPI.listScoreVotes(projectId),
                CIQSupabaseAPI.listFinalResults(projectId),
                CIQSupabaseAPI.listQuestionScorers(projectId),
            ]);
            const entries = Object.values(window._entriesRaw || {});
            const entryNumberById = Object.fromEntries(entries.map(entry => [entry.id, entry.entryNumber || entry.entry_number]));
            const nextScores = {};

            for (const scorer of scorers) {
                if (!scorer.completed_at) continue;
                const key = `__completed__q${scorer.question_number}`;
                if (!nextScores[key]) nextScores[key] = {};
                nextScores[key][scorer.scorer_member_id] = true;
            }

            for (const vote of votes) {
                const entryNumber = entryNumberById[vote.entry_id];
                if (!entryNumber) continue;
                if (!nextScores[entryNumber]) nextScores[entryNumber] = {};
                const qKey = `q${vote.question_number}`;
                if (!nextScores[entryNumber][qKey]) nextScores[entryNumber][qKey] = {};
                nextScores[entryNumber][qKey][vote.scorer_member_id] = vote.result;
            }

            for (const finalResult of finals) {
                const entryNumber = entryNumberById[finalResult.entry_id];
                if (!entryNumber) continue;
                const key = `__final__q${finalResult.question_number}`;
                if (!nextScores[key]) nextScores[key] = {};
                nextScores[key][entryNumber] = finalResult.result;
            }

            scoresData = nextScores;
        }

        async function initSupabaseAdmin() {
            const project = await CIQSupabaseAPI.getProject(projectId);
            totalQuestions = project.question_count || 100;
            requiredScorers = project.required_scorers || 3;
            adminProjectName = project.name || projectId;
            adminReplyTo = project.reply_to || null;

            document.getElementById('question-count').value = totalQuestions;
            document.getElementById('stat-total').textContent = totalQuestions;

            document.getElementById('entry-open-toggle').checked = project.entry_open === true;
            if (project.period_start) {
                const val = toLocalInputValue(project.period_start);
                document.getElementById('entry-period-start').value = val;
                document.getElementById('dt-start-display').textContent = formatDtDisplay(val);
            }
            if (project.period_end) {
                const val = toLocalInputValue(project.period_end);
                document.getElementById('entry-period-end').value = val;
                document.getElementById('dt-end-display').textContent = formatDtDisplay(val);
            }
            if (project.max_entries && project.max_entries > 0) {
                document.getElementById('max-entries-toggle').checked = true;
                document.getElementById('max-entries-status').textContent = `${project.max_entries}人`;
                document.getElementById('max-entries-status').className = 'status-badge status-open';
                document.getElementById('max-entries-input-area').style.display = 'block';
                document.getElementById('setting-max-entries').value = project.max_entries;
            } else {
                document.getElementById('max-entries-toggle').checked = false;
                document.getElementById('max-entries-status').textContent = '制限なし';
                document.getElementById('max-entries-status').className = 'status-badge status-closed';
                document.getElementById('max-entries-input-area').style.display = 'none';
            }
            updateEntryOpenStatus();

            document.getElementById('setting-terms').value = project.terms || '';
            document.getElementById('setting-reply-to').value = project.reply_to || '';
            const disclosureToggle = document.getElementById('disclosure-open-toggle');
            if (disclosureToggle) disclosureToggle.checked = project.disclosure_enabled === true;
            if (project.disclosure_period_start) {
                const val = toLocalInputValue(project.disclosure_period_start);
                document.getElementById('disclosure-period-start').value = val;
                document.getElementById('dt-disclosure-start-display').textContent = formatDtDisplay(val);
            }
            if (project.disclosure_period_end) {
                const val = toLocalInputValue(project.disclosure_period_end);
                document.getElementById('disclosure-period-end').value = val;
                document.getElementById('dt-disclosure-end-display').textContent = formatDtDisplay(val);
            }
            if (typeof updateDisclosureOpenStatus === 'function') updateDisclosureOpenStatus();

            try {
                const entries = await CIQSupabaseAPI.listEntriesForAdmin(projectId);
                entryNumbers = entries.map(e => e.entry_number).sort((a, b) => a - b);
                window._entriesRaw = Object.fromEntries(entries.map(e => [e.id, normalizeSupabaseEntry(e)]));
                window.setAdminEntriesCount?.(entries.length);
            } catch (e) {
                console.warn('参加者一覧の初期取得をスキップ:', e);
            }

            modelAnswers = new Array(totalQuestions).fill('');
            try {
                const rows = await CIQSupabaseAPI.listModelAnswers(projectId);
                rows.forEach(row => {
                    const idx = Number(row.question_number) - 1;
                    if (idx >= 0 && idx < modelAnswers.length) modelAnswers[idx] = row.answer || '';
                });
            } catch (e) {
                console.warn('模範解答の読み込みをスキップ:', e);
            }
            renderModelGrid();
            await refreshSupabaseScoringData();
            updateAdminOverview();
        }

        function updateAdminOverview() {
            const entryStatus = document.getElementById('entry-open-status')?.textContent?.trim() || '確認中';
            const disclosureStatus = document.getElementById('disclosure-open-status')?.textContent?.trim() || '確認中';
            const entryCount = adminEntriesCount || (window._entriesRaw ? Object.keys(window._entriesRaw).length : 0);
            const done = document.getElementById('stat-done')?.textContent || '-';
            const conflict = document.getElementById('stat-conflict')?.textContent || '-';
            const total = totalQuestions || document.getElementById('stat-total')?.textContent || '-';
            const csvStatus = document.getElementById('csv-status');
            const outputReady = csvStatus?.classList.contains('ready');

            const setText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            };

            setText('overview-entry-status', entryStatus);
            setText('overview-entry-count', `参加者 ${entryCount} 名`);
            setText('overview-disclosure-status', disclosureStatus);
            setText('overview-disclosure-meta', '成績照会ページ');
            setText('overview-scoring-status', conflict !== '-' && Number(conflict) > 0 ? '要確認あり' : '進行中');
            setText('overview-scoring-count', `${done} / ${total} 問完了`);
            setText('overview-output-status', outputReady ? '出力可能' : '未確定');
            setText('overview-output-meta', outputReady ? 'CSV / PDF を出力できます' : '全問確定後に出力できます');
        }

        window.updateAdminOverview = updateAdminOverview;
        window.setAdminEntriesCount = function(count) {
            adminEntriesCount = count || 0;
            updateAdminOverview();
        };

        // タブ切り替え（遅延ロード対応）
        const tabLoaded = { 'tab-entries': false, 'tab-prep': false, 'tab-scan': false, 'tab-stats': false, 'tab-settings': false };

        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            const btns = document.querySelectorAll('.tab-btn');
            const tabs = ['tab-entries', 'tab-prep', 'tab-scan', 'tab-stats', 'tab-settings'];
            btns[tabs.indexOf(tabId)]?.classList.add('active');

            // 遅延ロード: 初回表示時のみデータ取得
            if (!tabLoaded[tabId]) {
                tabLoaded[tabId] = true;
                switch (tabId) {
                    case 'tab-entries':
                        loadAdminEntries();
                        break;
                    case 'tab-scan':
                        loadEntryList();
                        break;
                    case 'tab-settings':
                        if (isSupabaseMode && typeof loadProjectMembers === 'function') loadProjectMembers();
                        break;
                }
            }
            // 集計タブは毎回更新
            if (tabId === 'tab-stats') updateStatsView();
            updateAdminOverview();
        }

        async function init() {
            setupAdminEventHandlers();
            setupPublicLinks();
            registerAdminShortcuts();

            if (!isSupabaseMode) throw new Error('Supabase設定が必要です。');

            await initSupabaseAdmin();
            const hash = location.hash.replace('#', '');
            if (hash && document.getElementById(hash)) {
                switchTab(hash);
            } else {
                tabLoaded['tab-entries'] = true;
                if (typeof loadAdminEntries === 'function') loadAdminEntries();
            }
        }

        // init() は admin_settings.js（最後に読み込まれるスクリプト）の末尾で呼び出し
