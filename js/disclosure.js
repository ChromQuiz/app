// disclosure.js — 成績照会（メールアドレス + パスワード認証）

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');

function showEl(el) {
    el?.classList.remove('u-hidden');
    el?.classList.add('is-visible');
}

function hideEl(el) {
    el?.classList.add('u-hidden');
    el?.classList.remove('is-visible');
}

function disclosureIcon(className) {
    const icon = createIcon(className);
    return icon;
}

function setButtonLabel(button, iconClass, text) {
    if (!button) return;
    button.textContent = '';
    button.append(disclosureIcon(iconClass), ` ${text}`);
}

function showMissingProject() {
    const container = document.querySelector('.page-container');
    if (!container) return;
    container.textContent = '';
    const card = document.createElement('div');
    card.className = 'page-card page-disabled';
    card.appendChild(disclosureIcon('fa-solid fa-ban'));
    const title = document.createElement('p');
    title.textContent = 'プロジェクトが指定されていません。';
    const detail = document.createElement('p');
    detail.className = 'disclosure-disabled-detail';
    detail.textContent = '正しいリンクからアクセスしてください。';
    card.append(title, detail);
    container.appendChild(card);
}

if (!projectId) {
    showMissingProject();
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
                hideEl(document.getElementById('login-card'));
                document.getElementById('disabled-title').textContent = closed.title;
                document.getElementById('disabled-detail').textContent = closed.detail;
                showEl(document.getElementById('disabled-card'));
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
                title: '成績照会は現在停止中です',
                detail: '管理者が照会を開始するまでお待ちください。'
            };
        }

        const now = new Date();
        const start = parseLocalDateTime(settings.disclosurePeriodStart);
        const end = parseLocalDateTime(settings.disclosurePeriodEnd);
        if (start && start > now) {
            return {
                title: '成績照会はまだ開始されていません',
                detail: '照会開始: ' + start.toLocaleString('ja-JP')
            };
        }
        if (end && end < now) {
            return {
                title: '成績照会は終了しました',
                detail: '照会終了: ' + end.toLocaleString('ja-JP')
            };
        }
        return null;
    }

    async function checkDisclosure(event) {
        event?.preventDefault();
        const form = document.getElementById('login-card');
        const errEl = document.getElementById('error-msg');
        errEl.classList.remove('is-visible');
        if (!form.reportValidity()) {
            errEl.textContent = 'メールアドレスとパスワードを入力してください。';
            errEl.classList.add('is-visible');
            return;
        }

        const email = document.getElementById('f-email').value.trim();
        const pw = document.getElementById('pw-input').value.trim();
        const btn = document.getElementById('submit-btn');

        if (!email || !pw) {
            errEl.textContent = 'メールアドレスとパスワードを入力してください。';
            errEl.classList.add('is-visible'); return;
        }

        btn.disabled = true;
        btn.textContent = '確認中...';

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
            } else if (e.message?.includes('成績照会の対象外')) {
                errEl.textContent = 'このエントリーは成績照会の対象外です。';
            } else if (e.message?.includes('Disclosure')) {
                errEl.textContent = '成績照会は現在利用できません。';
            } else {
                errEl.textContent = 'エラーが発生しました。もう一度お試しください。';
            }
            errEl.classList.add('is-visible');
        }
        btn.disabled = false;
        setButtonLabel(btn, 'fa-solid fa-unlock', '成績を確認する');
    }

    function showResult(disc) {
        hideEl(document.getElementById('login-card'));
        showEl(document.getElementById('result-card'));
        document.getElementById('result-name').textContent = disc.displayName || '';
        document.getElementById('result-rank').textContent = disc.rank || '';
        document.getElementById('result-score').textContent = disc.score;

        // 連答表示
        const streaksEl = document.getElementById('result-streaks');
        streaksEl.textContent = '';
        if (disc.streaks && disc.streaks.length > 0) {
            const show = disc.streaks.slice(0, 2);
            const title = document.createElement('div');
            title.className = 'streak-title';
            title.textContent = 'Streak';
            const list = document.createElement('div');
            list.className = 'streak-list';
            show.forEach((s, i) => {
                const item = document.createElement('span');
                item.className = 'streak-item';
                const label = document.createElement('span');
                label.className = 'streak-label';
                label.textContent = ordinal(i + 1);
                const value = document.createElement('span');
                value.className = 'streak-val';
                value.textContent = s;
                item.append(label, value);
                list.appendChild(item);
            });
            streaksEl.append(title, list);
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
            preview.textContent = '';
            const img = document.createElement('img');
            img.src = url;
            img.alt = '共有カード';
            img.className = 'share-preview-img';
            preview.appendChild(img);

            showEl(document.getElementById('share-area'));
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
        hideEl(document.getElementById('result-card'));
        showEl(document.getElementById('login-card'));
        hideEl(document.getElementById('share-area'));
    }

    function setupDisclosureEvents() {
        document.getElementById('login-card')?.addEventListener('submit', checkDisclosure);
        document.getElementById('share-main-btn')?.addEventListener('click', shareResult);
        document.getElementById('share-download-btn')?.addEventListener('click', downloadShareImage);
        document.getElementById('disclosure-back-btn')?.addEventListener('click', showLogin);
    }

    setupDisclosureEvents();
    init();
