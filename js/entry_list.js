// entry_list.js - Supabase public entry list

const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');

    if (!projectId) {
        document.getElementById('disabled-msg').innerHTML = '<i class="fa-solid fa-ban"></i>プロジェクトが指定されていません。正しいURLへアクセスしてください。';
    }

    let maxEntries = 0;
    let entryOpenTime = 0;
    const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30分
    let publicEntrySubscription = null;

    async function loadPublicSettings() {
        if (!window.CIQSupabaseAPI?.isEnabled?.()) {
            throw new Error('Supabase設定が見つかりません。');
        }
        return CIQSupabaseAPI.getPublicSettings(projectId);
    }

    async function init() {
        if (!projectId) return;

        let pubSettings = {};
        try {
            pubSettings = await loadPublicSettings() || {};
            let pName = pubSettings.projectName || projectId;
            if (!pName) pName = projectId;
            document.getElementById('page-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - エントリーリスト';
        } catch(e) {
            document.getElementById('page-title').textContent = projectId;
        }

        // 定員取得
        maxEntries = pubSettings.maxEntries || 0;

        // エントリー開始時刻取得
        if (pubSettings.periodStart) {
            entryOpenTime = new Date(pubSettings.periodStart).getTime();
        }

        // リストを常に表示
        document.getElementById('disabled-msg').style.display = 'none';
        document.getElementById('content-area').style.display = 'block';

        publicEntrySubscription = CIQSupabaseAPI.subscribePublicEntries(projectId, (data) => {
            renderList(data);
        });
        window.addEventListener('beforeunload', () => publicEntrySubscription?.stop?.());
    }

    /**
     * 優先順位を計算する
     * - canceledは除外
     * - 30分以内: 完全先着順
     * - 30分以降: 中部優先 → その他 (各内部で先着順)
     */
    function calcPriority(entries) {
        const active = entries.filter(e => e.status !== 'canceled');
        // timestamp順にソート
        active.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        const cutoff = entryOpenTime > 0 ? entryOpenTime + GRACE_PERIOD_MS : 0;

        let early, lateChubu, lateOther;
        if (cutoff > 0) {
            early = active.filter(e => (e.timestamp || 0) <= cutoff);
            const late = active.filter(e => (e.timestamp || 0) > cutoff);
            lateChubu = late.filter(e => e.isChubu === true);
            lateOther = late.filter(e => e.isChubu !== true);
        } else {
            // エントリー開始時刻未設定 → 全員先着順
            early = active;
            lateChubu = [];
            lateOther = [];
        }

        const earlyCount = early.length;
        const ordered = [...early, ...lateChubu, ...lateOther];
        ordered.forEach((e, i) => {
            e._priority = i + 1;
            e._isWaitlist = maxEntries > 0 && e._priority > maxEntries;
            e._isAfterGrace = i >= earlyCount && cutoff > 0;
        });
        return { ordered, earlyCount, hasGraceSplit: cutoff > 0 && earlyCount < ordered.length };
    }

    function renderList(data) {
        const body = document.getElementById('list-body');
        body.innerHTML = '';

        if (!data) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">まだエントリーはありません。</td></tr>';
            document.getElementById('total-count').textContent = 0;
            return;
        }

        const entries = Object.values(data);
        const { ordered, earlyCount, hasGraceSplit } = calcPriority(entries);

        const confirmed = ordered.filter(e => !e._isWaitlist);
        const waitlist = ordered.filter(e => e._isWaitlist);

        const renderRow = (e, isWaitlist) => {
            const d = new Date(e.timestamp || Date.now());
            const m = (d.getMonth()+1).toString().padStart(2,'0');
            const day = d.getDate().toString().padStart(2,'0');
            const h = d.getHours().toString().padStart(2,'0');
            const min = d.getMinutes().toString().padStart(2,'0');
            const timeStr = `${m}/${day} ${h}:${min}`;
            const grade = e.grade !== '非表示' ? e.grade : '';
            const waitIcon = isWaitlist ? '<i class="fa-solid fa-clock" style="color:var(--warning);margin-right:4px;" title="キャンセル待ち"></i>' : '';
            const chubuMark = e.isChubu ? '<i class="fa-solid fa-check" style="color:var(--success);" title="中部地方"></i>' : '';

            const tr = document.createElement('tr');
            if (isWaitlist) tr.style.opacity = '0.6';
            tr.innerHTML = `
                <td style="font-weight:700">${e._priority}</td>
                <td class="c-time">${waitIcon}${timeStr} <span style="color:#555;font-size:11px;margin-left:4px">#${padNum(e.entryNumber)}</span></td>
                <td>${escapeHtml(e.affiliation || '')}</td>
                <td>${escapeHtml(grade)}</td>
                <td>${escapeHtml(e.entryName || '')}</td>
                <td>${escapeHtml(e.message || '')}</td>
                <td style="text-align:center">${chubuMark}</td>
            `;
            body.appendChild(tr);
        };

        // 先着順エリア（30分以内）
        let graceDividerInserted = false;
        confirmed.forEach(e => {
            if (!graceDividerInserted && hasGraceSplit && e._isAfterGrace) {
                graceDividerInserted = true;
                const divider = document.createElement('tr');
                divider.innerHTML = `<td colspan="7" style="text-align:center;padding:8px;background:var(--primary-soft);color:var(--primary);font-size:12px;font-weight:600;letter-spacing:1px;">
                    <i class="fa-solid fa-map-location-dot"></i> 以降中部地方優先
                </td>`;
                body.appendChild(divider);
            }
            renderRow(e, false);
        });

        if (waitlist.length > 0) {
            const divider = document.createElement('tr');
            divider.innerHTML = `<td colspan="7" style="text-align:center;padding:8px;background:var(--warning-soft);color:var(--warning);font-size:12px;font-weight:600;letter-spacing:1px;">
                <i class="fa-solid fa-clock"></i> キャンセル待ち（${waitlist.length}名）
            </td>`;
            body.appendChild(divider);
            waitlist.forEach(e => renderRow(e, true));
        }

        document.getElementById('total-count').textContent = ordered.length;
    }

    init();
