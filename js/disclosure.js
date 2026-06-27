// disclosure.js — 成績照会（メールアドレス + パスワード認証）

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');

if (!projectId) {
    document.querySelector('.page-container').innerHTML = '<div class="page-card page-disabled"><i class="fa-solid fa-ban"></i><p>プロジェクトが指定されていません。</p><p style="margin-top:8px;font-size:13px">正しいリンクからアクセスしてください。</p></div>';
}

    async function init() {
        if (!projectId) return;

        // プロジェクト名を取得して表示
        try {
            if (!window.CIQSupabaseAPI?.isEnabled?.()) {
                throw new Error('Supabase設定が見つかりません。');
            }
            const settings = await CIQSupabaseAPI.getPublicSettings(projectId);
            let pName = settings?.projectName || projectId;
            document.getElementById('logo-title').textContent = pName || projectId;
            document.title = (pName || projectId) + ' - 成績照会';

            const closed = getDisclosureClosedReason(settings || {});
            if (closed) {
                document.getElementById('login-card').style.display = 'none';
                document.getElementById('disabled-title').textContent = closed.title;
                document.getElementById('disabled-detail').textContent = closed.detail;
                document.getElementById('disabled-card').style.display = 'block';
            }
        } catch(e) {
            document.getElementById('logo-title').textContent = projectId;
        }
    }

    function parseLocalDateTime(dtStr) {
        if (!dtStr) return null;
        if (dtStr.includes('T')) {
            const [d, t] = dtStr.split('T');
            const [y, m, day] = d.split('-').map(Number);
            const [hr, min] = t.split(':').map(Number);
            return new Date(y, m - 1, day, hr, min);
        }
        return new Date(dtStr);
    }

    function getDisclosureClosedReason(settings) {
        if (settings.disclosureOpen !== true) {
            return {
                title: '成績開示は現在停止中です',
                detail: '管理者が開示を開始するまでお待ちください。'
            };
        }

        const now = new Date();
        const start = parseLocalDateTime(settings.disclosurePeriodStart);
        const end = parseLocalDateTime(settings.disclosurePeriodEnd);
        if (start && start > now) {
            return {
                title: '成績開示はまだ開始されていません',
                detail: '開示開始: ' + start.toLocaleString('ja-JP')
            };
        }
        if (end && end < now) {
            return {
                title: '成績開示は終了しました',
                detail: '開示終了: ' + end.toLocaleString('ja-JP')
            };
        }
        return null;
    }

    async function checkDisclosure() {
        const email = document.getElementById('f-email').value.trim();
        const pw = document.getElementById('pw-input').value.trim();
        const errEl = document.getElementById('error-msg');
        const btn = document.getElementById('submit-btn');

        errEl.style.display = 'none';

        if (!email || !pw) {
            errEl.textContent = 'メールアドレスとパスワードを入力してください。';
            errEl.style.display = 'block'; return;
        }

        btn.disabled = true; btn.textContent = '確認中...';

        try {
            const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
            const pwHash = await AppCrypto.hashPassword(pw);
            const disc = await CIQSupabaseAPI.discloseResult({
                projectId,
                emailHash,
                disclosurePasswordHash: pwHash,
            });
            showResult(disc);

        } catch(e) {
            if (e.message?.includes('Entry not found')) {
                errEl.textContent = 'メールアドレスまたはパスワードが正しくありません。';
            } else if (e.message?.includes('Disclosure')) {
                errEl.textContent = '成績開示は現在利用できません。';
            } else {
                errEl.textContent = 'エラーが発生しました。もう一度お試しください。';
            }
            errEl.style.display = 'block';
        }
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-unlock"></i> 成績を確認する';
    }

    function showResult(disc) {
        document.getElementById('login-card').style.display = 'none';
        document.getElementById('result-card').style.display = 'block';
        document.getElementById('result-name').textContent = disc.displayName || '';
        document.getElementById('result-rank').textContent = disc.rank || '';
        document.getElementById('result-score').textContent = disc.score;

        // 連答表示
        const streaksEl = document.getElementById('result-streaks');
        if (disc.streaks && disc.streaks.length > 0) {
            const show = disc.streaks.slice(0, 2);
            const streakItems = show.map((s, i) => 
                `<span class="streak-item"><span class="streak-label">${ordinal(i + 1)}</span><span class="streak-val">${s}</span></span>`
            ).join('');
            streaksEl.innerHTML = `<div class="streak-title">Streak</div><div class="streak-list">${streakItems}</div>`;
        } else {
            streaksEl.innerHTML = '';
        }

        // 共有画像を生成
        generateShareCard(disc);
    }

    // ── SNS共有 ──
    let shareBlob = null;
    let shareProjectName = '';

    function getShareText() {
        const tag = '#' + shareProjectName.replace(/\s+/g, '');
        return `${tag} に参加しました!!`;
    }

    async function generateShareCard(disc) {
        shareProjectName = document.getElementById('logo-title').textContent || 'CIQ';
        try {
            shareBlob = await ShareCard.generate({
                projectName: shareProjectName,
                rank: disc.rank || '-',
                score: disc.score ?? '-',
                streaks: disc.streaks || [],
            });

            // プレビュー表示
            const preview = document.getElementById('share-preview');
            const url = URL.createObjectURL(shareBlob);
            preview.innerHTML = `<img src="${url}" alt="共有カード" class="share-preview-img">`;

            document.getElementById('share-area').style.display = 'block';
        } catch(e) {
            console.error('共有画像の生成に失敗:', e);
        }
    }

    function downloadBlob() {
        if (!shareBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(shareBlob);
        a.download = 'ciq_result.png';
        a.click();
    }

    async function shareResult() {
        if (!shareBlob) return;
        const file = new File([shareBlob], 'ciq_result.png', { type: 'image/png' });
        const shareData = { text: getShareText(), files: [file] };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                return;
            } catch(e) {
                if (e.name === 'AbortError') return;
            }
        }
        // デスクトップ等フォールバック
        downloadBlob();
        navigator.clipboard.writeText(getShareText()).catch(() => {});
        alert('画像を保存しました。テキストはクリップボードにコピー済みです。');
    }

    function downloadShareImage() {
        downloadBlob();
    }

    function ordinal(n) {
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v-20)%10] || s[v] || s[0]);
    }

    function showLogin() {
        document.getElementById('result-card').style.display = 'none';
        document.getElementById('login-card').style.display = 'block';
        document.getElementById('share-area').style.display = 'none';
    }

    // Enterキーで送信
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && document.getElementById('login-card').style.display !== 'none') {
            checkDisclosure();
        }
    });

    init();
