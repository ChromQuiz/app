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
        const icon = createIcon('ban');
        disabledMsg.append(icon, '大会が指定されていません。正しいURLへアクセスしてください。');
    }

    let maxEntries = 0;
    let entryOpenTime = 0;
    // 中部枠: エントリー開始から24時間は中部地方を優先する。
    // サーバ側の recompute_entry_statuses(202609030001)と同じ値・同じ規則を保つこと。
    const CHUBU_PRIORITY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24時間
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
            document.getElementById('page-title').textContent = projectId || 'エントリーリスト';
            if (!projectId) {
                const sub = document.getElementById('page-subtitle');
                if (sub) sub.textContent = '';
            }
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
     * 優先順位を計算する。サーバ側 recompute_entry_statuses と同じ規則。
     * - canceled は除外
     * - 1) 開始24時間以内 かつ 中部 (エントリー順)
     * - 2) 開始24時間以内 かつ 中部以外 (エントリー順)
     * - 3) 24時間経過後 (中部かどうかを問わずエントリー順)
     * エントリー開始時刻が未設定の大会は優先枠を適用せず全員先着順。
     *
     * 表示ロジックから切り離してテストできるよう、状態は引数で受け取る。
     */
    function calcPriority(entries, opts) {
        const openTime = opts?.entryOpenTime || 0;
        const capacity = opts?.maxEntries || 0;
        const windowMs = opts?.windowMs || 0;

        const active = entries.filter(e => e.status !== 'canceled');
        // エントリー順(同時刻は受付番号順)に揃えてから区分に振り分ける
        active.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)
            || (a.entryNumber || 0) - (b.entryNumber || 0));

        const cutoff = openTime > 0 ? openTime + windowMs : 0;

        let earlyChubu, earlyOther, late;
        if (cutoff > 0) {
            const early = active.filter(e => (e.timestamp || 0) <= cutoff);
            earlyChubu = early.filter(e => e.isChubu === true);
            earlyOther = early.filter(e => e.isChubu !== true);
            late = active.filter(e => (e.timestamp || 0) > cutoff);
        } else {
            // エントリー開始時刻未設定 → 全員先着順
            earlyChubu = [];
            earlyOther = [];
            late = active;
        }

        const earlyChubuCount = earlyChubu.length;
        const earlyOtherCount = earlyOther.length;
        const ordered = [...earlyChubu, ...earlyOther, ...late];
        ordered.forEach((e, i) => {
            e._priority = i + 1;
            // 順位だけで見たときのキャンセル待ち（定員を超える順位）
            e._isWaitlist = capacity > 0 && e._priority > capacity;
            // 画面に出すのはサーバーが決めた状態。当日受付を済ませた人は、順位が定員を超えていても登録済みのまま残るため、
            // 順位だけで判定すると、受付を済ませた人をキャンセル待ちに出してしまう。状態が無いときだけ順位で判定する。
            e._showWaitlist = e.status ? e.status === 'waitlist' : e._isWaitlist;
        });
        return {
            ordered,
            earlyChubuCount,
            earlyOtherCount,
            lateCount: late.length,
            hasPriorityWindow: cutoff > 0 && earlyChubuCount + earlyOtherCount > 0,
        };
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

        const { ordered, earlyChubuCount, earlyOtherCount, lateCount, hasPriorityWindow } = calcPriority(entries, {
            entryOpenTime,
            maxEntries,
            windowMs: CHUBU_PRIORITY_WINDOW_MS,
        });
        const waitlistCount = ordered.filter(e => e._showWaitlist).length;

        const renderRow = (e, isWaitlist) => {
            // 日本時間で表示する（端末の時間帯に依存しない）
            const timeStr = formatShortDateTimeJa(e.timestamp || Date.now());
            // 学年を非公開にした人は空欄にする(入力フォームの値は「非公開」、古いデータには「非表示」がある)
            const grade = (e.grade === '非公開' || e.grade === '非表示') ? '' : (e.grade || '');

            const tr = document.createElement('tr');
            if (isWaitlist) tr.classList.add('entry-row-waitlist');

            // 受付番号
            const numberTd = document.createElement('td');
            numberTd.className = 'entry-number-cell';
            numberTd.dataset.label = '受付番号';
            numberTd.textContent = padNum(e.entryNumber);

            const timeTd = document.createElement('td');
            timeTd.className = 'c-time';
            timeTd.dataset.label = '日時';
            timeTd.textContent = timeStr;

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
            messageTd.textContent = errorDetail(e, '');

            tr.append(numberTd, timeTd, nameTd, affiliationTd, gradeTd, messageTd);
            body.appendChild(tr);
        };

        // 境目の線は、キャンセル待ちの最初の行の手前に引く（定員の位置ではなく、実際の状態に合わせる）
        const firstWaitlistIndex = ordered.findIndex(e => e._showWaitlist);
        ordered.forEach((entry, index) => {
            if (index === firstWaitlistIndex && waitlistCount > 0) {
                const capacityNote = maxEntries > 0 ? ` · 定員${maxEntries}名` : '';
                appendDivider(body, 'clock', `ここまで出場圏内${capacityNote} — 以下キャンセル待ち（${waitlistCount}名）`, 'entry-list-divider-warning');
            }
            if (hasPriorityWindow && index === 0 && earlyChubuCount > 0) {
                appendDivider(body, 'map-pin', '中部地方（開始24時間以内）', 'entry-list-divider-rule');
            }
            // 先頭の区分には「以降」を付けない（前の区分がないので）
            if (hasPriorityWindow && index === earlyChubuCount && earlyOtherCount > 0) {
                appendDivider(body, 'map-pin', `${index === 0 ? '' : '以降 '}中部地方以外（開始24時間以内）`, 'entry-list-divider-rule');
            }
            if (hasPriorityWindow && index === earlyChubuCount + earlyOtherCount && lateCount > 0) {
                appendDivider(body, 'clock', `${index === 0 ? '' : '以降 '}開始24時間経過後（先着）`, 'entry-list-divider-rule');
            }
            renderRow(entry, entry._showWaitlist);
        });

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
        appendTableMessage(body, `参加者一覧を読み込めませんでした。時間をおいて再読み込みしてください。（詳細：${errorDetail(error)}）`);
    }

    init();
