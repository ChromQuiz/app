// disclosure.js — 成績開示（Firebase SDK版）

const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');
    const secretHash = params.get('secret');

    if (!projectId) {
        document.querySelector('.page-container').innerHTML = '<div class="page-card page-disabled"><i class="fa-solid fa-ban"></i><p>プロジェクトが指定されていません。</p><p style="margin-top:8px;font-size:13px">正しいリンクからアクセスしてください。</p></div>';
    }

    async function init() {
        if (!projectId) return;
        await waitForAuth();

        // プロジェクト名を取得して表示
        try {
            let pName = await dbGet(`projects/${projectId}/publicSettings/projectName`);
            if (!pName) pName = await dbGet(`projects/${projectId}/settings/projectName`);
            document.getElementById('logo-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - 成績開示';
        } catch(e) {
            document.getElementById('logo-title').textContent = projectId;
        }
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
            // パスワード照合: entries から entryNumber で検索
            const entriesData = await dbQuery(`projects/${projectId}/entries`, 'entryNumber', num);

            if (!entriesData || Object.keys(entriesData).length === 0) {
                errEl.textContent = '該当する受付番号が見つかりません。';
                errEl.style.display = 'block'; btn.disabled = false; btn.textContent = '成績を確認する'; return;
            }

            let matched = false;
            let entryData = null;
            const pwHash = await AppCrypto.hashPassword(pw);

            for (const d of Object.values(entriesData)) {
                if (d.disclosurePw === pwHash || d.disclosurePw === pw) {
                    matched = true; entryData = d;
                }
            }

            if (!matched) {
                errEl.textContent = 'パスワードが正しくありません。';
                errEl.style.display = 'block'; btn.disabled = false; btn.textContent = '成績を確認する'; return;
            }

            // 開示データ取得
            const disc = await dbGet(`projects/${projectId}/protected/${secretHash}/disclosure/${num}`);
            if (!disc) {
                errEl.textContent = '開示データがまだ生成されていません。管理者にお問い合わせください。';
                errEl.style.display = 'block'; btn.disabled = false; btn.textContent = '成績を確認する'; return;
            }

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