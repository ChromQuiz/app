// admin_settings.js — プロジェクト設定・エクスポート・削除・オンボーディング

        window.adjustNumberInput = async function(id, delta) {
            const input = document.getElementById(id);
            if (!input) return;
            let val = parseInt(input.value) || 0;
            const min = parseInt(input.min);
            const max = parseInt(input.max);
            val += delta;
            if (!isNaN(min) && val < min) val = min;
            if (!isNaN(max) && val > max) val = max;
            input.value = val;
            
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);

            // 問題数変更時はSupabaseにも同期
            if (id === 'question-count') {
                try {
                    await CIQSupabaseAPI.updateProject(projectId, { question_count: val });
                    totalQuestions = val;
                    showAdminToast(`問題数を ${val} 問に変更しました`, 'success');
                } catch(e) { console.error('問題数の同期失敗:', e); }
            }
        };


        // ============================
        // 設定更新処理
        // ============================

        function setMemberTableMessage(tbody, message, className = 'td-loading') {
            tbody.textContent = '';
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.className = className;
            td.textContent = message;
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        function appendMemberActionButton(container, options) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn ${options.variant || 'secondary'} member-action-btn`;
            button.disabled = Boolean(options.disabled);
            if (options.icon) {
                const icon = document.createElement('i');
                icon.className = options.icon;
                button.appendChild(icon);
                button.appendChild(document.createTextNode(' '));
            }
            button.appendChild(document.createTextNode(options.label));
            button.addEventListener('click', options.onClick);
            container.appendChild(button);
        }

        function appendProjectMemberRow(tbody, member, currentUserId) {
            const roleLabel = member.role === 'owner' ? '所有者' : member.role === 'admin' ? '管理者' : '採点者';
            const statusLabel = member.status === 'removed' ? '停止中' : '有効';
            const isSelf = member.user_id === currentUserId;
            const canChange = member.role !== 'owner' && !isSelf;

            const tr = document.createElement('tr');
            if (member.status === 'removed') tr.className = 'member-row-removed';

            [member.display_name || member.invited_email || '-', roleLabel, statusLabel].forEach((text) => {
                const td = document.createElement('td');
                td.textContent = text;
                tr.appendChild(td);
            });

            const actionTd = document.createElement('td');
            const actionGroup = document.createElement('div');
            actionGroup.className = 'member-action-group';
            if (member.status === 'removed') {
                appendMemberActionButton(actionGroup, {
                    label: '復帰',
                    icon: 'fa-solid fa-rotate-left',
                    disabled: isSelf,
                    onClick: () => restoreProjectMember(member.id),
                });
            } else {
                appendMemberActionButton(actionGroup, {
                    label: member.role === 'admin' ? '採点者へ' : '管理者へ',
                    disabled: !canChange,
                    onClick: () => changeProjectMemberRole(member.id, member.role === 'admin' ? 'scorer' : 'admin'),
                });
                appendMemberActionButton(actionGroup, {
                    label: 'キック',
                    icon: 'fa-solid fa-user-slash',
                    variant: 'danger',
                    disabled: !canChange,
                    onClick: () => removeProjectMember(member.id),
                });
            }
            actionTd.appendChild(actionGroup);
            tr.appendChild(actionTd);
            tbody.appendChild(tr);
        }

        function setTableMessage(tbody, colspan, message, className = 'td-loading') {
            tbody.textContent = '';
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = colspan;
            td.className = className;
            td.textContent = message;
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        function getCachedAdminEntries() {
            const cached = Object.values(window._entriesRaw || {});
            if (!cached.length) return null;
            return cached.sort((a, b) => Number(a.entry_number || a.entryNumber || 0) - Number(b.entry_number || b.entryNumber || 0));
        }

        function yieldToBrowser() {
            return new Promise(resolve => setTimeout(resolve, 0));
        }

        async function loadProjectMembers() {
            const tbody = document.getElementById('project-members-tbody');
            if (!tbody) return;
            setMemberTableMessage(tbody, '読み込み中...');
            try {
                const currentSession = await CIQSupabaseAPI.getSession();
                const currentUserId = currentSession?.user?.id || '';
                const members = await CIQSupabaseAPI.listProjectMembers(projectId);
                if (!members.length) {
                    setMemberTableMessage(tbody, 'メンバーがいません。');
                    return;
                }
                tbody.textContent = '';
                members.forEach(member => appendProjectMemberRow(tbody, member, currentUserId));
            } catch (e) {
                setMemberTableMessage(tbody, `読み込みに失敗しました: ${e.message}`, 'td-loading-error');
            }
        }

        async function changeProjectMemberRole(memberId, role) {
            try {
                await CIQSupabaseAPI.updateProjectMemberRole(memberId, role);
                showAdminToast('権限を更新しました', 'success');
                await loadProjectMembers();
            } catch (e) {
                showAdminToast(e.message || '権限更新に失敗しました', 'error');
            }
        }

        async function removeProjectMember(memberId) {
            const ok = await showConfirm('このメンバーをキックします。同じパスワードでは再参加できなくなります。', 'キックする');
            if (!ok) return;
            try {
                await CIQSupabaseAPI.removeProjectMember(memberId);
                showAdminToast('メンバーを停止しました', 'success');
                await loadProjectMembers();
            } catch (e) {
                showAdminToast(e.message || 'キックに失敗しました', 'error');
            }
        }

        async function restoreProjectMember(memberId) {
            try {
                await CIQSupabaseAPI.restoreProjectMember(memberId);
                showAdminToast('メンバーを復帰しました', 'success');
                await loadProjectMembers();
            } catch (e) {
                showAdminToast(e.message || '復帰に失敗しました', 'error');
            }
        }

        async function updateTerms() {
            const termsText = document.getElementById('setting-terms').value.trim();
            await CIQSupabaseAPI.updateProject(projectId, { terms: termsText || null });
            showAdminToast('参加規約を更新しました', 'success');
        }

        window.updateEmailSettings = async function() {
            await CIQSupabaseAPI.updateProject(projectId, {
                notify_entry_edit: document.getElementById('setting-notify-entry-edit')?.checked !== false,
                notify_entry_cancel: document.getElementById('setting-notify-entry-cancel')?.checked !== false,
                notify_late_notice: document.getElementById('setting-notify-late-notice')?.checked !== false,
            });
            showAdminToast('メール設定を更新しました', 'success');
        };

        function toggleMaxEntries() {
            const isOn = document.getElementById('max-entries-toggle').checked;
            const badge = document.getElementById('max-entries-status');
            const inputArea = document.getElementById('max-entries-input-area');
            if (isOn) {
                badge.textContent = document.getElementById('setting-max-entries').value + '人';
                badge.className = 'status-badge status-open';
                inputArea.classList.remove('u-hidden');
            } else {
                badge.textContent = '制限なし';
                badge.className = 'status-badge status-closed';
                inputArea.classList.add('u-hidden');
            }
            saveEntryPeriod();
        }


        // ============================
        // 参加者管理・エントリー管理
        // ============================
        async function toggleEntryOpen() {
            const enabled = document.getElementById('entry-open-toggle').checked;
            await CIQSupabaseAPI.updateProject(projectId, { entry_open: enabled });
            updateEntryOpenStatus();
            showAdminToast(enabled ? 'エントリー設定を更新しました' : 'エントリーを停止しました', 'success');
        }
        function updateEntryOpenStatus() {
            const isOpen = document.getElementById('entry-open-toggle').checked;
            const ps = document.getElementById('entry-period-start').value;
            const pe = document.getElementById('entry-period-end').value;
            const el = document.getElementById('entry-open-status');
            const summary = document.getElementById('entry-state-summary');
            const meta = document.getElementById('entry-state-meta');

            const setPublicState = (label, detail) => {
                if (summary) summary.textContent = label;
                if (meta) meta.textContent = detail;
            };

            if (!isOpen) {
                el.textContent = '停止中';
                el.className = 'status-badge status-closed';
                setPublicState('停止中', 'エントリーフォームは利用不可');
                window.updateAdminOverview?.();
                return;
            }

            const now = new Date();
            if (ps && new Date(ps) > now) {
                el.textContent = '期間外（開始前）';
                el.className = 'status-badge status-warning';
                setPublicState('開始前', `${formatDtDisplay(ps)} から`);
                window.updateAdminOverview?.();
                return;
            }
            if (pe && new Date(pe) < now) {
                el.textContent = '期間外（終了済）';
                el.className = 'status-badge status-warning';
                setPublicState('終了済', `${formatDtDisplay(pe)} まで`);
                window.updateAdminOverview?.();
                return;
            }

            el.textContent = 'エントリー中';
            el.className = 'status-badge status-open';
            setPublicState('エントリー中', pe ? `${formatDtDisplay(pe)} まで` : '終了日時なし');
            window.updateAdminOverview?.();
        }

        async function saveEntryPeriod() {
            const start = document.getElementById('entry-period-start').value || null;
            const end = document.getElementById('entry-period-end').value || null;
            const hasLimit = document.getElementById('max-entries-toggle').checked;
            const maxEntries = hasLimit ? (parseInt(document.getElementById('setting-max-entries').value) || 100) : 0;
            await CIQSupabaseAPI.updateProject(projectId, {
                period_start: start ? new Date(start).toISOString() : null,
                period_end: end ? new Date(end).toISOString() : null,
                max_entries: maxEntries
            });
            // トグルONなら人数バッジも更新
            if (hasLimit) {
                document.getElementById('max-entries-status').textContent = maxEntries + '人';
            }
            showAdminToast('エントリー期間・定員を保存しました', 'success');
        }

        async function toggleDisclosureOpen() {
            const enabled = document.getElementById('disclosure-open-toggle').checked;
            await CIQSupabaseAPI.updateProject(projectId, { disclosure_enabled: enabled });
            updateDisclosureOpenStatus();
            showAdminToast(enabled ? '成績照会を有効にしました' : '成績照会を停止しました', 'success');
        }

        function updateDisclosureOpenStatus() {
            const toggle = document.getElementById('disclosure-open-toggle');
            const el = document.getElementById('disclosure-open-status');
            if (!toggle || !el) return;
            const isOpen = toggle.checked;
            const ps = document.getElementById('disclosure-period-start').value;
            const pe = document.getElementById('disclosure-period-end').value;
            const summary = document.getElementById('disclosure-state-summary');
            const meta = document.getElementById('disclosure-state-meta');

            const setPublicState = (label, detail) => {
                if (summary) summary.textContent = label;
                if (meta) meta.textContent = detail;
            };

            if (!isOpen) {
                el.textContent = '停止中';
                el.className = 'status-badge status-closed';
                setPublicState('停止中', '成績照会ページは利用不可');
                window.updateAdminOverview?.();
                return;
            }

            const now = new Date();
            if (ps && new Date(ps) > now) {
                el.textContent = '期間外（開始前）';
                el.className = 'status-badge status-warning';
                setPublicState('開始前', `${formatDtDisplay(ps)} から`);
                window.updateAdminOverview?.();
                return;
            }
            if (pe && new Date(pe) < now) {
                el.textContent = '期間外（終了済）';
                el.className = 'status-badge status-warning';
                setPublicState('終了済', `${formatDtDisplay(pe)} まで`);
                window.updateAdminOverview?.();
                return;
            }

            el.textContent = '照会中';
            el.className = 'status-badge status-open';
            setPublicState('照会中', pe ? `${formatDtDisplay(pe)} まで` : '終了日時なし');
            window.updateAdminOverview?.();
        }

        async function saveDisclosurePeriod() {
            const start = document.getElementById('disclosure-period-start').value || null;
            const end = document.getElementById('disclosure-period-end').value || null;
            await CIQSupabaseAPI.updateProject(projectId, {
                disclosure_period_start: start ? new Date(start).toISOString() : null,
                disclosure_period_end: end ? new Date(end).toISOString() : null
            });
            updateDisclosureOpenStatus();
            showAdminToast('照会期間を保存しました', 'success');
        }

        // ============================
        // Custom DateTime Picker
        // ============================
        let dtScope = 'entry'; // 'entry' or 'disclosure'
        let dtTarget = null; // 'start' or 'end'
        let dtYear, dtMonth, dtDay, dtHour = 0, dtMin = 0;

        function formatDtDisplay(val) {
            if (!val) return '未設定';
            const d = new Date(val);
            const mm = d.getMonth() + 1, dd = d.getDate();
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`;
        }

        function getPeriodPrefix(scope = dtScope) {
            return scope === 'disclosure' ? 'disclosure' : 'entry';
        }

        function getDtDisplayId(scope, target) {
            return scope === 'disclosure' ? `dt-disclosure-${target}-display` : `dt-${target}-display`;
        }

        function getDtTriggerId(scope, target) {
            return scope === 'disclosure' ? `dt-disclosure-${target}-trigger` : `dt-${target}-trigger`;
        }

        function openDatePicker(scopeOrTarget, maybeTarget) {
            dtScope = maybeTarget ? scopeOrTarget : 'entry';
            dtTarget = maybeTarget || scopeOrTarget;
            const prefix = getPeriodPrefix(dtScope);
            const existing = document.getElementById(`${prefix}-period-${dtTarget}`).value;
            const now = existing ? new Date(existing) : new Date();
            dtYear = now.getFullYear(); dtMonth = now.getMonth();
            dtDay = now.getDate();
            dtHour = now.getHours(); dtMin = now.getMinutes();

            // populate hour/min selectors
            const hSel = document.getElementById('dt-picker-hour');
            const mSel = document.getElementById('dt-picker-min');
            hSel.textContent = ''; mSel.textContent = '';
            for (let h = 0; h < 24; h++) {
                const o = document.createElement('option'); o.value = h;
                o.textContent = String(h).padStart(2, '0');
                if (h === dtHour) o.selected = true;
                hSel.appendChild(o);
            }
            for (let m = 0; m < 60; m += 5) {
                const o = document.createElement('option'); o.value = m;
                o.textContent = String(m).padStart(2, '0');
                if (m <= dtMin && m + 5 > dtMin) o.selected = true;
                mSel.appendChild(o);
            }

            renderDtDays();

            const picker = document.getElementById('dt-picker');
            picker.hidden = false;
            document.getElementById('dt-picker-overlay').hidden = false;
        }

        function closeDatePicker() {
            document.getElementById('dt-picker').hidden = true;
            document.getElementById('dt-picker-overlay').hidden = true;
        }

        function dtNavMonth(delta) {
            dtMonth += delta;
            if (dtMonth < 0) { dtMonth = 11; dtYear--; }
            if (dtMonth > 11) { dtMonth = 0; dtYear++; }
            renderDtDays();
        }

        function renderDtDays() {
            const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
            document.getElementById('dt-picker-month').textContent = `${dtYear}年 ${months[dtMonth]}`;

            const container = document.getElementById('dt-picker-days');
            container.textContent = '';

            const firstDay = new Date(dtYear, dtMonth, 1).getDay();
            const daysInMonth = new Date(dtYear, dtMonth + 1, 0).getDate();
            const prevDays = new Date(dtYear, dtMonth, 0).getDate();
            const today = new Date();

            // Previous month padding
            for (let i = firstDay - 1; i >= 0; i--) {
                const btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'dt-day other';
                btn.textContent = prevDays - i;
                container.appendChild(btn);
            }
            // Current month
            for (let d = 1; d <= daysInMonth; d++) {
                const btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'dt-day';
                btn.textContent = d;
                if (d === dtDay && dtMonth === today.getMonth() && dtYear === today.getFullYear() && d === today.getDate()) {
                    btn.classList.add('today');
                } else if (d === today.getDate() && dtMonth === today.getMonth() && dtYear === today.getFullYear()) {
                    btn.classList.add('today');
                }
                if (d === dtDay) btn.classList.add('selected');
                btn.onclick = () => { dtDay = d; renderDtDays(); };
                container.appendChild(btn);
            }
            // Next month padding
            const totalCells = firstDay + daysInMonth;
            const remaining = (7 - totalCells % 7) % 7;
            for (let i = 1; i <= remaining; i++) {
                const btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'dt-day other';
                btn.textContent = i;
                container.appendChild(btn);
            }
        }

        function dtConfirm() {
            dtHour = parseInt(document.getElementById('dt-picker-hour').value);
            dtMin = parseInt(document.getElementById('dt-picker-min').value);
            const d = new Date(dtYear, dtMonth, dtDay, dtHour, dtMin);
            // Format as datetime-local value
            const pad = n => String(n).padStart(2, '0');
            const val = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            
            const prefix = getPeriodPrefix();
            document.getElementById(`${prefix}-period-${dtTarget}`).value = val;
            document.getElementById(getDtDisplayId(dtScope, dtTarget)).textContent = formatDtDisplay(val);
            closeDatePicker();
            if (dtScope === 'disclosure') {
                saveDisclosurePeriod();
            } else {
                saveEntryPeriod();
                updateEntryOpenStatus();
            }
        }

        function dtClear() {
            const prefix = getPeriodPrefix();
            document.getElementById(`${prefix}-period-${dtTarget}`).value = '';
            document.getElementById(getDtDisplayId(dtScope, dtTarget)).textContent = '未設定';
            closeDatePicker();
            if (dtScope === 'disclosure') {
                saveDisclosurePeriod();
            } else {
                saveEntryPeriod();
                updateEntryOpenStatus();
            }
        }

        async function loadAdminEntries() {
            const tbody = document.getElementById('admin-entries-tbody');
            setTableMessage(tbody, 7, '読み込み中...');

            try {
                const entries = getCachedAdminEntries() || await CIQSupabaseAPI.listEntriesForAdmin(projectId);
                window._entriesRaw = Object.fromEntries(entries.map(e => [e.id, normalizeSupabaseEntry(e)]));
                entryNumbers = entries.map(e => e.entry_number || e.entryNumber).sort((a, b) => a - b);
                if (!entries.length) {
                    setTableMessage(tbody, 7, '名簿データがありません。');
                    window.setAdminEntriesCount?.(0);
                    return;
                }
                tbody.textContent = '';
                window.setAdminEntriesCount?.(entries.length);
                const privateKeyText = session.get('privateKeyJwk');
                let privJwk = null;
                if (privateKeyText) {
                    try {
                        privJwk = JSON.parse(privateKeyText);
                    } catch (e) {
                        console.warn('復号鍵の読み込みをスキップ:', e);
                    }
                }
                const fragment = document.createDocumentFragment();
                const rowsToHydrate = [];
                for (const v of entries) {
                    const tr = document.createElement('tr');
                    if (v.status === 'canceled') tr.classList.add('member-row-canceled');
                    if (v.status === 'waitlist') tr.classList.add('member-row-waitlist');
                    appendAdminEntryRow(tr, v, null);
                    if (v.encrypted_pii) rowsToHydrate.push({ row: tr, entry: v });
                    fragment.appendChild(tr);
                    if (fragment.childNodes.length >= 20) {
                        tbody.appendChild(fragment);
                        await yieldToBrowser();
                    }
                }
                tbody.appendChild(fragment);
                if (privJwk) {
                    hydrateAdminEntryPII(rowsToHydrate, privJwk);
                } else if (window._adminPrivateKeyReadyPromise) {
                    window._adminPrivateKeyReadyPromise.then(() => {
                        const readyKeyText = session.get('privateKeyJwk');
                        if (!readyKeyText) return null;
                        return JSON.parse(readyKeyText);
                    }).then((readyKey) => {
                        hydrateAdminEntryPII(rowsToHydrate, readyKey);
                    }).catch(e => console.warn('復号鍵の後追い読み込みをスキップ:', e));
                }
            } catch (e) {
                setTableMessage(tbody, 7, `参加者一覧を読み込めませんでした。ページを再読み込みしてください。${e.message ? ` (${e.message})` : ''}`, 'td-loading-error');
            }
        }

        function createBadge(className, iconClass, title, styles = {}) {
            const badge = document.createElement('span');
            badge.className = className;
            badge.title = title;
            Object.assign(badge.style, styles);
            const icon = document.createElement('i');
            icon.className = iconClass;
            badge.appendChild(icon);
            return badge;
        }

        function appendAdminEntryCell(row, content) {
            const td = document.createElement('td');
            if (content instanceof Node) {
                td.appendChild(content);
            } else {
                td.textContent = content;
            }
            row.appendChild(td);
            return td;
        }

        function appendStackedText(container, primary, secondary, emptyText = '-') {
            container.appendChild(document.createTextNode(primary || emptyText));
            if (!secondary) return;
            container.appendChild(document.createElement('br'));
            const sub = document.createElement('span');
            sub.className = 'text-muted-sm';
            sub.textContent = secondary;
            container.appendChild(sub);
        }

        function appendAdminEntryRow(row, entry, pii = null) {
            appendAdminEntryCell(row, padNum(entry.entry_number) || '-');

            const nameInfo = document.createDocumentFragment();
            const fullName = [pii?.familyName, pii?.firstName].filter(Boolean).join(' ');
            const fullKana = [pii?.familyNameKana, pii?.firstNameKana].filter(Boolean).join(' ');
            const encryptedStatus = entry.encrypted_pii
                ? (session.get('privateKeyJwk') ? '復号不可' : '復号鍵なし')
                : '';
            appendStackedText(nameInfo, fullName, fullKana || encryptedStatus);
            appendAdminEntryCell(row, nameInfo);

            appendAdminEntryCell(row, pii?.entryName || entry.entry_name || '');
            appendAdminEntryCell(row, pii?.affiliation || entry.affiliation || '');
            appendAdminEntryCell(row, pii?.grade || entry.grade || '');

            const emailInfo = document.createDocumentFragment();
            appendStackedText(emailInfo, pii?.email || '', pii?.email ? '' : encryptedStatus);
            appendAdminEntryCell(row, emailInfo);

            const statusTd = appendAdminEntryCell(row, document.createDocumentFragment());
            if (entry.status === 'canceled') {
                statusTd.appendChild(createBadge('badge danger', 'fa-solid fa-xmark', 'キャンセル'));
            } else if (entry.status === 'waitlist') {
                statusTd.appendChild(createBadge('badge', 'fa-solid fa-clock', 'キャンセル待ち', {
                    background: 'var(--warning-soft)',
                    color: 'var(--warning)',
                }));
            } else if (entry.status === 'late') {
                statusTd.appendChild(createBadge('badge', 'fa-solid fa-clock-rotate-left', '遅刻', {
                    background: 'rgba(168,85,247,0.2)',
                    color: '#a855f7',
                }));
            } else if (entry.checked_in) {
                statusTd.appendChild(createBadge('badge success', 'fa-solid fa-check', '受付済'));
            } else {
                statusTd.appendChild(createBadge('badge muted', 'fa-regular fa-clock', '未受付'));
            }

            const noticeState = entry.waitlist_promotion_notice;
            if (noticeState === 'pending' || noticeState === 'sending') {
                statusTd.appendChild(createBadge('badge', 'fa-solid fa-envelope', '繰り上げ通知送信待ち', {
                    background: 'rgba(37,99,235,0.10)',
                    color: 'var(--primary)',
                }));
            } else if (noticeState === 'sent') {
                statusTd.appendChild(createBadge('badge success', 'fa-solid fa-envelope-circle-check', '繰り上げ通知送信済み'));
            } else if (noticeState === 'failed') {
                statusTd.appendChild(createBadge('badge danger', 'fa-solid fa-envelope-circle-xmark', '繰り上げ通知未送信'));
            }
        }

        async function hydrateAdminEntryPII(rows, privJwk) {
            if (!privJwk || !rows.length) return;
            for (const { row, entry } of rows) {
                if (!entry.encrypted_pii) continue;
                try {
                    const pii = JSON.parse(await AppCrypto.decryptRSA(entry.encrypted_pii, privJwk));
                    row.textContent = '';
                    appendAdminEntryRow(row, entry, pii);
                    if (entry.waitlist_promotion_notice === 'pending') {
                        sendWaitlistPromotionNotice(entry, pii).catch(e => console.warn('繰り上げ通知スキップ:', e));
                    }
                } catch (e) {
                    console.warn('PII復号をスキップ:', e);
                }
                await yieldToBrowser();
            }
        }

        async function sendWaitlistPromotionNotice(entry, pii) {
            if (!entry?.id) return;
            await CIQSupabaseAPI.updateEntryNoticeState(entry.id, 'sending');
            if (!pii?.email) {
                await CIQSupabaseAPI.updateEntryNoticeState(entry.id, 'failed');
                return;
            }
            const ok = await CIQEmail.sendWaitlistPromotion(pii.email, {
                projectName: adminProjectName || projectId,
                entryNumber: String(entry.entry_number).padStart(3, '0'),
                entryId: entry.id,
                emailHash: entry.email_hash,
                familyName: pii.familyName || '',
                firstName: pii.firstName || '',
                senderName: (adminProjectName || projectId) + ' 実行委員会'
            });
            await CIQSupabaseAPI.updateEntryNoticeState(entry.id, ok ? 'sent' : 'failed');
            if (ok) showAdminToast(`受付番号 ${padNum(entry.entry_number)} へ繰り上げ通知を送信しました`, 'success');
        }

        async function exportEntriesCSV() {
            const entriesData = window._entriesRaw || Object.fromEntries((await CIQSupabaseAPI.listEntriesForAdmin(projectId)).map(e => [e.id, normalizeSupabaseEntry(e)]));
            if (!entriesData) return;
            const rows = [['受付番号', '姓', '名', 'セイ', 'メイ', 'メールアドレス', '所属機関', '学年', 'エントリー名', '意気込み', '連絡事項', '状態', 'UUID']];
            
            const children = Object.values(entriesData).sort((a, b) => (a.entryNumber || 0) - (b.entryNumber || 0));
            
            for (const v of children) {
                let pii = v;
                if (v.encryptedPII) {
                    try {
                        const privJwk = JSON.parse(session.get('privateKeyJwk'));
                        const jsonStr = await AppCrypto.decryptRSA(v.encryptedPII, privJwk);
                        pii = JSON.parse(jsonStr);
                    } catch(e) { console.error("Decryption failed", e); }
                }
                
                const stat = v.status === 'canceled' ? 'canceled' : v.status === 'waitlist' ? 'waitlist' : v.checkedIn ? 'checkedIn' : 'registered';
                rows.push([
                    v.entryNumber, pii.familyName || '', pii.firstName || '', pii.familyNameKana || '', pii.firstNameKana || '',
                    pii.email || '', pii.affiliation || '', pii.grade || '', pii.entryName || '', `"${(pii.message || '').replace(/"/g, '""')}"`,
                    `"${(pii.inquiry || '').replace(/"/g, '""')}"`, stat, v.uuid || v.id || ''
                ]);
            }
            const csv = rows.map(r => r.join(',')).join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = 'entries.csv'; a.click();
        }

        async function resetProject() {
            if (!(await showConfirm(
                'プロジェクト内の全データ（エントリー・答案・スコア）をリセットしますか？\n\n' +
                '⚠️ この操作は取り消せません。\n' +
                'プロジェクト設定（パスワード・暗号鍵等）は維持されます。',
                'リセットする'
            ))) return;

            // 2段階確認
            if (!(await showConfirm(
                `プロジェクト「${projectId}」を本当にリセットしますか？\nすべてのエントリー・答案・スコアが失われます。`,
                'リセットを確定'
            ))) return;

            try {
                showAdminToast('プロジェクトをリセットしています...', 'info', 10000);

                await CIQSupabaseAPI.resetProjectData(projectId);
                showAdminToast('プロジェクトをリセットしました。ページを再読み込みします。', 'success', 3000);
                setTimeout(() => { location.reload(); }, 2000);
            } catch (e) {
                console.error('リセットエラー:', e);
                showAdminToast('リセットエラー: ' + e.message, 'error');
            }
        }

        init();
