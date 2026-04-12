const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');
    const secretHash = params.get('secret');

    if (!projectId) {
        document.querySelector('.page-container').innerHTML = '<div class="page-card page-disabled"><i class="fa-solid fa-ban"></i><p>プロジェクトが指定されていません。</p><p style="margin-top:8px;font-size:13px">正しいリンクからアクセスしてください。</p></div>';
    }

    async function init() {
        if (!projectId) return;

        // プロジェクト名を取得して表示
        try {
            const settingsSnap = await db.ref(`projects/${projectId}/publicSettings/projectName`).once('value');
            if (settingsSnap.exists()) {
                const pName = settingsSnap.val();
                document.getElementById('logo-title').textContent = pName;
                document.getElementById('logo-subtitle').textContent = '成績開示';
                document.title = pName + ' - 成績開示';
            }
        } catch(e) {}
    }

    async function checkDisclosure() {
        const entryNum = document.getElementById('entry-number').value.trim();
        const pw = document.getElementById('pw-input').value.trim();
        const errEl = document.getElementById('error-msg');
        const btn = document.getElementById('submit-btn');

        errEl.style.display = 'none';

        if (!entryNum || !pw) {
            errEl.textContent = '受付番号とパスワードを入力してください。';
            errEl.style.display = 'block'; return;
        }

        const num = parseInt(entryNum, 10);
        if (isNaN(num) || num < 1) {
            errEl.textContent = '正しい受付番号を入力してください。';
            errEl.style.display = 'block'; return;
        }

        btn.disabled = true; btn.textContent = '確認中...';

        try {
            // パスワード照合: entries からUUIDで検索
            const entriesSnap = await db.ref(`projects/${projectId}/entries`)
                .orderByChild('entryNumber').equalTo(num).once('value');

            if (!entriesSnap.exists()) {
                errEl.textContent = '該当する受付番号が見つかりません。';
                errEl.style.display = 'block'; btn.disabled = false; btn.textContent = '成績を確認する'; return;
            }

            let matched = false;
            let entryData = null;
            const pwHash = await hashPassword(pw);

            entriesSnap.forEach(child => {
                const d = child.val();
                if (d.disclosurePw === pwHash || d.disclosurePw === pw) {
                    matched = true; entryData = d;
                }
            });

            if (!matched) {
                errEl.textContent = 'パスワードが正しくありません。';
                errEl.style.display = 'block'; btn.disabled = false; btn.textContent = '成績を確認する'; return;
            }

            // 開示データ取得
            const discSnap = await db.ref(`projects/${projectId}/protected/${secretHash}/disclosure/${num}`).get();
            if (!discSnap.exists()) {
                errEl.textContent = '開示データがまだ生成されていません。管理者にお問い合わせください。';
                errEl.style.display = 'block'; btn.disabled = false; btn.textContent = '成績を確認する'; return;
            }

            const disc = discSnap.val();
            showResult(entryData.entryName || `受付番号 ${num}`, disc.score, disc.results, disc.totalQuestions || 100);

        } catch(e) {
            errEl.textContent = 'エラーが発生しました。もう一度お試しください。';
            errEl.style.display = 'block';
        }
        btn.disabled = false; btn.textContent = '成績を確認する';
    }

    function showResult(name, score, results, total) {
        document.getElementById('login-card').style.display = 'none';
        document.getElementById('result-card').style.display = 'block';
        document.getElementById('result-name').textContent = name;
        document.getElementById('result-score').textContent = score;
        document.getElementById('result-total').textContent = total;

        const grid = document.getElementById('result-grid');
        grid.innerHTML = '';
        for (let i = 1; i <= total; i++) {
            const r = results?.[`q${i}`] || 'wrong';
            const cell = document.createElement('div');
            cell.className = `result-cell ${r === 'correct' ? 'correct' : 'wrong'}`;
            cell.innerHTML = `<span class="q-num">${i}</span>${r === 'correct' ? '○' : '×'}`;
            grid.appendChild(cell);
        }
    }

    function showLogin() {
        document.getElementById('result-card').style.display = 'none';
        document.getElementById('login-card').style.display = 'block';
    }

    // Enterキーで送信
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && document.getElementById('login-card').style.display !== 'none') {
            checkDisclosure();
        }
    });

    init();