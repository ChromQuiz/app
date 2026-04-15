// entry_list.js — エントリーリスト（完全REST版・WebSocket接続ゼロ）

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
        loadList();

        // 10秒ごとに自動更新（WebSocket .on() の代替）
        setInterval(loadList, 10000);
    }

    async function loadList() {
        const body = document.getElementById('list-body');

        try {
            const data = await dbGet(`projects/${projectId}/entries`);
            body.innerHTML = '';
            let count = 0;

            if (data) {
                // 配列化してソート (エントリー番号順)
                const entries = Object.values(data).filter(e => e.status !== 'canceled');
                entries.sort((a, b) => (a.entryNumber || 0) - (b.entryNumber || 0));

                count = entries.length;

                entries.forEach(e => {
                    const d = new Date(e.timestamp || Date.now());
                    const m = (d.getMonth()+1).toString().padStart(2,'0');
                    const day = d.getDate().toString().padStart(2,'0');
                    const h = d.getHours().toString().padStart(2,'0');
                    const min = d.getMinutes().toString().padStart(2,'0');
                    const timeStr = `${m}/${day} ${h}:${min}`;

                    const grade = e.grade !== '非表示' ? `(${e.grade})` : '';
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="c-time">${timeStr} <span style="color:#555;font-size:11px;margin-left:4px">#${e.entryNumber}</span></td>
                        <td><span class="c-affil">${e.affiliation}</span></td>
                        <td><span class="c-grade">${grade}</span></td>
                        <td class="c-name">${e.entryName}</td>
                        <td class="c-msg">${e.message || ''}</td>
                    `;
                    body.appendChild(tr);
                });
            }

            if (count === 0) {
                body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">まだエントリーはありません。</td></tr>';
            }
            document.getElementById('total-count').textContent = count;
        } catch (e) {
            console.error('リスト取得エラー:', e);
        }
    }

    init();