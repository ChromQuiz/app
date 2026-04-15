// entry_list.js — エントリーリスト（Firebase SDK版）

const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');
    const secretHash = params.get('secret');

    if (!projectId) {
        document.getElementById('disabled-msg').innerHTML = '<i class="fa-solid fa-ban"></i>プロジェクトが指定されていません。正しいURLへアクセスしてください。';
    }

    async function init() {
        if (!projectId) return;
        await waitForAuth();

        // プロジェクト名を取得して表示
        try {
            let pName = await dbGet(`projects/${projectId}/publicSettings/projectName`);
            if (!pName) pName = await dbGet(`projects/${projectId}/settings/projectName`);
            document.getElementById('page-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - エントリーリスト';
        } catch(e) {
            document.getElementById('page-title').textContent = projectId;
        }

        // リストを常に表示
        document.getElementById('disabled-msg').style.display = 'none';
        document.getElementById('content-area').style.display = 'block';

        // リアルタイムリスナーで自動更新
        new Poller(`projects/${projectId}/entries`, (data) => {
            renderList(data);
        }).start();
    }

    function renderList(data) {
        const body = document.getElementById('list-body');
        body.innerHTML = '';
        let count = 0;

            if (data) {
                // 配列化してソート (エントリー番号順)
                const entries = Object.values(data).filter(e => e.status !== 'canceled');
                entries.sort((a, b) => (a.entryNumber || 0) - (b.entryNumber || 0));

                // 確定とキャンセル待ちに分離
                const confirmed = entries.filter(e => e.status === 'registered');
                const waitlist = entries.filter(e => e.status === 'waitlist');
                count = entries.length;

                const renderRow = (e, isWaitlist) => {
                    const d = new Date(e.timestamp || Date.now());
                    const m = (d.getMonth()+1).toString().padStart(2,'0');
                    const day = d.getDate().toString().padStart(2,'0');
                    const h = d.getHours().toString().padStart(2,'0');
                    const min = d.getMinutes().toString().padStart(2,'0');
                    const timeStr = `${m}/${day} ${h}:${min}`;
                    const grade = e.grade !== '非表示' ? `(${e.grade})` : '';
                    const waitIcon = isWaitlist ? '<i class="fa-solid fa-clock" style="color:#f59e0b;margin-right:4px;" title="キャンセル待ち"></i>' : '';
                    
                    const tr = document.createElement('tr');
                    if (isWaitlist) tr.style.opacity = '0.6';
                    tr.innerHTML = `
                        <td class="c-time">${waitIcon}${timeStr} <span style="color:#555;font-size:11px;margin-left:4px">#${padNum(e.entryNumber)}</span></td>
                        <td><span class="c-affil">${escapeHtml(e.affiliation)}</span></td>
                        <td><span class="c-grade">${escapeHtml(grade)}</span></td>
                        <td class="c-name">${escapeHtml(e.entryName)}</td>
                        <td class="c-msg">${escapeHtml(e.message || '')}</td>
                    `;
                    body.appendChild(tr);
                };

                confirmed.forEach(e => renderRow(e, false));

                if (waitlist.length > 0) {
                    const divider = document.createElement('tr');
                    divider.innerHTML = `<td colspan="5" style="text-align:center;padding:8px;background:rgba(245,158,11,0.1);color:#f59e0b;font-size:12px;font-weight:600;letter-spacing:1px;">
                        <i class="fa-solid fa-clock"></i> キャンセル待ち（${waitlist.length}名）
                    </td>`;
                    body.appendChild(divider);
                    waitlist.forEach(e => renderRow(e, true));
                }
            }

            if (count === 0) {
                body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">まだエントリーはありません。</td></tr>';
            }
            document.getElementById('total-count').textContent = count;
    }

    init();