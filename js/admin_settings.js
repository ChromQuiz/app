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
            const ok = await showConfirm('このメンバーをキックします。同じ採点者コードでは再参加できなくなります。', 'キックする');
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
            const replyTo = document.getElementById('setting-reply-to').value.trim();
            await CIQSupabaseAPI.updateProject(projectId, { reply_to: replyTo || null });
            adminReplyTo = replyTo || null;
            showAdminToast('メール設定を更新しました', 'success');
        };

        function toggleMaxEntries() {
            const isOn = document.getElementById('max-entries-toggle').checked;
            const badge = document.getElementById('max-entries-status');
            const inputArea = document.getElementById('max-entries-input-area');
            if (isOn) {
                badge.textContent = document.getElementById('setting-max-entries').value + '人';
                badge.className = 'status-badge status-open';
                inputArea.style.display = 'block';
            } else {
                badge.textContent = '制限なし';
                badge.className = 'status-badge status-closed';
                inputArea.style.display = 'none';
            }
            saveEntryPeriod();
        }


        // ============================
        // 参加者管理・受付管理
        // ============================
        async function toggleEntryOpen() {
            const enabled = document.getElementById('entry-open-toggle').checked;
            await CIQSupabaseAPI.updateProject(projectId, { entry_open: enabled });
            updateEntryOpenStatus();
            showAdminToast(enabled ? 'エントリー受付設定を更新しました' : 'エントリー受付を停止しました', 'success');
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
                setPublicState('停止中', '受付フォームは利用不可');
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

            el.textContent = '受付中';
            el.className = 'status-badge status-open';
            setPublicState('受付中', pe ? `${formatDtDisplay(pe)} まで` : '終了日時なし');
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
            showAdminToast('受付期間・定員を保存しました', 'success');
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
            hSel.innerHTML = ''; mSel.innerHTML = '';
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

            // Position
            const trigger = document.getElementById(getDtTriggerId(dtScope, dtTarget));
            const rect = trigger.getBoundingClientRect();
            const picker = document.getElementById('dt-picker');
            picker.style.top = (rect.bottom + 8) + 'px';
            picker.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
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
            container.innerHTML = '';

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
            tbody.innerHTML = '<tr><td colspan="7" class="td-loading">読み込み中...</td></tr>';

            try {
                const entries = await CIQSupabaseAPI.listEntriesForAdmin(projectId);
                window._entriesRaw = Object.fromEntries(entries.map(e => [e.id, normalizeSupabaseEntry(e)]));
                entryNumbers = entries.map(e => e.entry_number).sort((a, b) => a - b);
                if (!entries.length) {
                    tbody.innerHTML = '<tr><td colspan="7" class="td-loading">名簿データがありません。</td></tr>';
                    window.setAdminEntriesCount?.(0);
                    return;
                }
                tbody.innerHTML = '';
                window.setAdminEntriesCount?.(entries.length);
                for (const v of entries) {
                    let pii = null;
                    if (v.encrypted_pii && session.get('privateKeyJwk')) {
                        try {
                            const privJwk = JSON.parse(session.get('privateKeyJwk'));
                            pii = JSON.parse(await AppCrypto.decryptRSA(v.encrypted_pii, privJwk));
                        } catch (e) {
                            console.warn('PII復号をスキップ:', e);
                        }
                    }
                    if (v.waitlist_promotion_notice === 'pending') {
                        sendWaitlistPromotionNotice(v, pii).catch(e => console.warn('繰り上げ通知スキップ:', e));
                    }

                    const tr = document.createElement('tr');
                    if (v.status === 'canceled') tr.style.opacity = '0.5';
                    if (v.status === 'waitlist') tr.style.opacity = '0.7';
                    const noticeIcon = v.waitlist_promotion_notice === 'pending' || v.waitlist_promotion_notice === 'sending'
                        ? '<span class="badge" style="background:rgba(37,99,235,0.10);color:var(--primary)" title="繰り上げ通知送信待ち"><i class="fa-solid fa-envelope"></i></span>'
                        : v.waitlist_promotion_notice === 'sent'
                            ? '<span class="badge success" title="繰り上げ通知送信済み"><i class="fa-solid fa-envelope-circle-check"></i></span>'
                            : v.waitlist_promotion_notice === 'failed'
                                ? '<span class="badge danger" title="繰り上げ通知未送信"><i class="fa-solid fa-envelope-circle-xmark"></i></span>'
                                : '';
                    const statText = v.status === 'canceled' ? '<span class="badge danger" title="キャンセル"><i class="fa-solid fa-xmark"></i></span>'
                        : v.status === 'waitlist' ? '<span class="badge" style="background:var(--warning-soft);color:var(--warning)" title="キャンセル待ち"><i class="fa-solid fa-clock"></i></span>'
                        : v.status === 'late' ? '<span class="badge" style="background:rgba(168,85,247,0.2);color:#a855f7" title="遅刻"><i class="fa-solid fa-clock-rotate-left"></i></span>'
                        : v.checked_in ? '<span class="badge success" title="受付済"><i class="fa-solid fa-check"></i></span>' : '<span class="badge muted" title="未受付"><i class="fa-regular fa-clock"></i></span>';
                    tr.innerHTML = `
                        <td>${padNum(v.entry_number) || '-'}</td>
                        <td>-<br><span class="text-muted-sm">暗号化情報</span></td>
                        <td>${escapeHtml(v.entry_name || '')}</td>
                        <td>${escapeHtml(v.affiliation || '')}</td>
                        <td>${escapeHtml(v.grade || '')}</td>
                        <td><span class="text-muted-sm">メールは暗号化保存</span><br>-</td>
                        <td>${statText}${noticeIcon}</td>
                    `;
                    tbody.appendChild(tr);
                }
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="7" class="td-loading-error">読み込みに失敗しました: ' + escapeHtml(e.message) + '</td></tr>';
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
                senderName: (adminProjectName || projectId) + ' 実行委員会',
                replyTo: adminReplyTo
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
