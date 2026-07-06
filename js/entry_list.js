// entry_list.js - Supabase public entry list

const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');

    function showEl(el) {
        el?.classList.remove('u-hidden');
    }

    function hideEl(el) {
        el?.classList.add('u-hidden');
    }

    if (!projectId) {
        const disabledMsg = document.getElementById('disabled-msg');
        disabledMsg.textContent = '';
        const icon = createIcon('fa-solid fa-ban');
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
        hideEl(document.getElementById('disabled-msg'));
        showEl(document.getElementById('content-area'));

        publicEntrySubscription = CIQSupabaseAPI.subscribePublicEntries(
            projectId,
            (data) => renderList(data),
            (error) => showEntryListError(error)
        );
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
        if (entries.length === 0) {
            appendTableMessage(body, 'まだエントリーはありません。');
            document.getElementById('total-count').textContent = 0;
            return;
        }

        const { ordered } = calcPriority(entries);

        const confirmed = ordered.filter(e => !e._isWaitlist);
        const waitlist = ordered.filter(e => e._isWaitlist);

        // 枠区分: 先着(開始30分以内) / 中部枠(以降の中部地方) / 一般(以降のその他)
        const slotLabel = (e) => {
            if (!e._isAfterGrace) return { label: '先着', cls: 'slot-early' };
            if (e.isChubu === true) return { label: '中部枠', cls: 'slot-chubu' };
            return { label: '一般', cls: 'slot-general' };
        };

        const renderRow = (e, isWaitlist) => {
            const d = new Date(e.timestamp || Date.now());
            const m = (d.getMonth()+1).toString().padStart(2,'0');
            const day = d.getDate().toString().padStart(2,'0');
            const h = d.getHours().toString().padStart(2,'0');
            const min = d.getMinutes().toString().padStart(2,'0');
            const timeStr = `${m}/${day} ${h}:${min}`;
            const grade = e.grade !== '非表示' ? e.grade : '';

            const tr = document.createElement('tr');
            if (isWaitlist) tr.classList.add('entry-row-waitlist');

            // 枠 = 順位 + 区分(自分が出場圏内か・どの枠で並んでいるかが行だけで分かる)
            const priorityTd = document.createElement('td');
            priorityTd.className = 'entry-priority-cell';
            priorityTd.dataset.label = '枠';
            const priorityBadge = document.createElement('span');
            priorityBadge.className = 'entry-priority-badge';
            priorityBadge.textContent = `#${e._priority}`;
            const slot = slotLabel(e);
            const slotSpan = document.createElement('span');
            slotSpan.className = `entry-slot-label ${slot.cls}`;
            slotSpan.textContent = slot.label;
            priorityTd.append(priorityBadge, slotSpan);

            const nameTd = document.createElement('td');
            nameTd.className = 'entry-list-name-cell';
            nameTd.dataset.label = 'エントリーネーム';
            nameTd.textContent = e.entryName || '';

            const affiliationTd = document.createElement('td');
            affiliationTd.className = 'entry-list-affiliation-cell';
            affiliationTd.dataset.label = '所属';
            affiliationTd.textContent = e.affiliation || '';
            const gradeTd = document.createElement('td');
            gradeTd.className = 'entry-list-grade-cell';
            gradeTd.dataset.label = '学年';
            gradeTd.textContent = grade;

            const messageTd = document.createElement('td');
            messageTd.className = 'entry-list-message-cell';
            messageTd.dataset.label = '意気込み';
            messageTd.textContent = e.message || '';

            const timeTd = document.createElement('td');
            timeTd.className = 'c-time';
            timeTd.dataset.label = '日時';
            timeTd.appendChild(document.createTextNode(`${timeStr} `));
            const numberSpan = document.createElement('span');
            numberSpan.className = 'entry-number-mini';
            numberSpan.textContent = `#${padNum(e.entryNumber)}`;
            timeTd.appendChild(numberSpan);

            tr.append(priorityTd, nameTd, affiliationTd, gradeTd, messageTd, timeTd);
            body.appendChild(tr);
        };

        confirmed.forEach(e => renderRow(e, false));

        // 定員ライン: ここから下は出場圏外(キャンセル待ち)
        if (waitlist.length > 0) {
            const capacityNote = maxEntries > 0 ? ` · 定員${maxEntries}名` : '';
            appendDivider(body, 'fa-solid fa-clock', `ここまで出場圏内${capacityNote} — 以下キャンセル待ち（${waitlist.length}名）`, 'entry-list-divider-warning');
            waitlist.forEach(e => renderRow(e, true));
        }

        document.getElementById('total-count').textContent = ordered.length;
        const capacityEl = document.getElementById('entry-capacity');
        if (capacityEl) capacityEl.textContent = maxEntries > 0 ? `（定員${maxEntries}名）` : '';
    }

    function appendTableMessage(body, message) {
        const tr = document.createElement('tr');
        tr.className = 'entry-list-message-row';
        const td = document.createElement('td');
        td.colSpan = 6;
        td.className = 'entry-table-message';
        td.textContent = message;
        tr.appendChild(td);
        body.appendChild(tr);
    }

    function appendDivider(body, iconClass, label, toneClass) {
        const divider = document.createElement('tr');
        divider.className = `entry-list-divider entry-list-message-row ${toneClass}`;
        const td = document.createElement('td');
        td.colSpan = 6;
        const icon = createIcon(iconClass);
        td.append(icon, ` ${label}`);
        divider.appendChild(td);
        body.appendChild(divider);
    }

    function showEntryListError(error) {
        hideEl(document.getElementById('disabled-msg'));
        showEl(document.getElementById('content-area'));
        document.getElementById('total-count').textContent = '-';
        const body = document.getElementById('list-body');
        body.textContent = '';
        const detail = error?.message ? `（${error.message}）` : '';
        appendTableMessage(body, `参加者一覧を読み込めませんでした。時間をおいて再読み込みしてください。${detail}`);
    }

    init();
