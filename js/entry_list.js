const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');
    const secretHash = params.get('secret');

    if (!projectId) {
        document.getElementById('disabled-msg').innerHTML = '<i class="fa-solid fa-ban"></i>プロジェクトが指定されていません。正しいURLへアクセスしてください。';
    }

    async function init() {
        if (!projectId) return;

        // プロジェクト名を取得して表示
        try {
            const s = await db.ref(`projects/${projectId}/publicSettings/projectName`).once('value');
            if (s.exists()) {
                const pName = s.val();
                document.getElementById('page-title').textContent = pName;
                document.getElementById('page-subtitle').textContent = 'エントリーリスト';
                document.title = pName + ' - エントリーリスト';
            }
        } catch(e) {}

        // リストを常に表示
        document.getElementById('disabled-msg').style.display = 'none';
        document.getElementById('content-area').style.display = 'block';
        loadList();
    }

    let listRef = null;
    let listListener = null;

    function unsubscribeList() {
        if (listRef && listListener) {
            listRef.off('value', listListener);
            listListener = null;
        }
    }

    function loadList() {
        if (listListener) return; // 既に接続済み

        listRef = db.ref(`projects/${projectId}/entries`);
        listListener = listRef.on('value', snap => {
            const body = document.getElementById('list-body');
            body.innerHTML = '';
            let count = 0;

            if (snap.exists()) {
                const data = snap.val();
                
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
        });
    }

    init();