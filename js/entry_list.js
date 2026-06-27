// entry_list.js - Supabase public entry list

const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');

    if (!projectId) {
        const disabledMsg = document.getElementById('disabled-msg');
        disabledMsg.textContent = '';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-ban';
        disabledMsg.append(icon, 'プロジェクトが指定されていません。正しいURLへアクセスしてください。');
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
        body.textContent = '';

        if (!data) {
            appendTableMessage(body, 'まだエントリーはありません。');
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

            const tr = document.createElement('tr');
            if (isWaitlist) tr.style.opacity = '0.6';
            const priorityTd = document.createElement('td');
            priorityTd.style.fontWeight = '700';
            priorityTd.textContent = e._priority;

            const timeTd = document.createElement('td');
            timeTd.className = 'c-time';
            if (isWaitlist) {
                const waitIcon = document.createElement('i');
                waitIcon.className = 'fa-solid fa-clock';
                waitIcon.style.color = 'var(--warning)';
                waitIcon.style.marginRight = '4px';
                waitIcon.title = 'キャンセル待ち';
                timeTd.appendChild(waitIcon);
            }
            timeTd.appendChild(document.createTextNode(`${timeStr} `));
            const numberSpan = document.createElement('span');
            numberSpan.style.color = '#555';
            numberSpan.style.fontSize = '11px';
            numberSpan.style.marginLeft = '4px';
            numberSpan.textContent = `#${padNum(e.entryNumber)}`;
            timeTd.appendChild(numberSpan);

            const affiliationTd = document.createElement('td');
            affiliationTd.textContent = e.affiliation || '';
            const gradeTd = document.createElement('td');
            gradeTd.textContent = grade;
            const nameTd = document.createElement('td');
            nameTd.textContent = e.entryName || '';
            const messageTd = document.createElement('td');
            messageTd.textContent = e.message || '';

            const chubuTd = document.createElement('td');
            chubuTd.style.textAlign = 'center';
            if (e.isChubu) {
                const chubuMark = document.createElement('i');
                chubuMark.className = 'fa-solid fa-check';
                chubuMark.style.color = 'var(--success)';
                chubuMark.title = '中部地方';
                chubuTd.appendChild(chubuMark);
            }

            tr.append(priorityTd, timeTd, affiliationTd, gradeTd, nameTd, messageTd, chubuTd);
            body.appendChild(tr);
        };

        // 先着順エリア（30分以内）
        let graceDividerInserted = false;
        confirmed.forEach(e => {
            if (!graceDividerInserted && hasGraceSplit && e._isAfterGrace) {
                graceDividerInserted = true;
                appendDivider(body, 'fa-solid fa-map-location-dot', '以降中部地方優先', 'var(--primary-soft)', 'var(--primary)');
            }
            renderRow(e, false);
        });

        if (waitlist.length > 0) {
            appendDivider(body, 'fa-solid fa-clock', `キャンセル待ち（${waitlist.length}名）`, 'var(--warning-soft)', 'var(--warning)');
            waitlist.forEach(e => renderRow(e, true));
        }

        document.getElementById('total-count').textContent = ordered.length;
    }

    function appendTableMessage(body, message) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.style.textAlign = 'center';
        td.style.color = '#888';
        td.textContent = message;
        tr.appendChild(td);
        body.appendChild(tr);
    }

    function appendDivider(body, iconClass, label, background, color) {
        const divider = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.style.textAlign = 'center';
        td.style.padding = '8px';
        td.style.background = background;
        td.style.color = color;
        td.style.fontSize = '12px';
        td.style.fontWeight = '600';
        td.style.letterSpacing = '1px';
        const icon = document.createElement('i');
        icon.className = iconClass;
        td.append(icon, ` ${label}`);
        divider.appendChild(td);
        body.appendChild(divider);
    }

    init();
