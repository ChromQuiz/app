// cancel.js - Supabase public cancellation

const params = new URLSearchParams(location.search);
const projectId = params.get('pid');
let projectName = '';
let globalReplyTo = null;

if (!projectId) {
    document.getElementById('form-card').innerHTML = '<p style="text-align:center;color:var(--danger);font-weight:600;">プロジェクトIDが不明です。正しいURLからアクセスしてください。</p>';
    throw new Error('No Project ID');
}

function requireSupabasePublicApi() {
    if (!window.CIQSupabaseAPI?.isEnabled?.()) {
        throw new Error('Supabase設定が見つかりません。');
    }
}

function showStatus(msg, type) {
    const sm = document.getElementById('status-msg');
    sm.textContent = msg;
    sm.className = `page-msg ${type}`;
    sm.style.display = 'block';
}

async function init() {
    try {
        requireSupabasePublicApi();
        const settings = await CIQSupabaseAPI.getPublicSettings(projectId);
        projectName = settings?.projectName || projectId;
        globalReplyTo = settings?.replyTo || null;
        document.getElementById('cancel-title').textContent = projectName;
        document.title = projectName + ' - キャンセルフォーム';
    } catch (e) {
        projectName = projectId;
        document.getElementById('cancel-title').textContent = projectId;
        showStatus(e.message || 'プロジェクト情報を読み込めませんでした。', 'error');
    }
}

async function processCancel() {
    const email = document.getElementById('f-email').value.trim();
    const pw = document.getElementById('f-password').value.trim();

    if (!email || !pw) {
        showStatus('メールアドレスとパスワードを入力してください。', 'error');
        return;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = '認証中...';
    showStatus('データを確認しています...', '');

    try {
        requireSupabasePublicApi();
        const emailHash = await AppCrypto.hashPassword(email.toLowerCase());
        const pwHash = await AppCrypto.hashPassword(pw);
        const result = await CIQSupabaseAPI.cancelEntry({
            projectId,
            emailHash,
            disclosurePasswordHash: pwHash,
        });

        const entryNum = result.canceledEntry?.entryNumber;
        CIQEmail.sendCancellation(email, {
            projectName: projectName || projectId,
            entryNumber: String(entryNum).padStart(3, '0'),
            entryId: result.canceledEntry?.id,
            emailHash,
            familyName: '',
            firstName: '',
            senderName: (projectName || projectId) + ' 実行委員会',
            replyTo: globalReplyTo
        }).catch(e => console.warn('キャンセルメール送信スキップ:', e));

        const promotedText = result.promotedEntry
            ? `<br>キャンセル待ちの受付番号 ${String(result.promotedEntry.entryNumber).padStart(3, '0')} を繰り上げました。`
            : '';

        document.getElementById('form-card').innerHTML = `
            <div style="text-align:center;">
                <h2 style="color:#ef5350;margin-bottom:16px;">キャンセル完了</h2>
                <p style="color:#8e8ea0;line-height:1.6;">
                    受付番号 ${entryNum} のエントリーキャンセルを受け付けました。<br>
                    確認メールを送信しました。${promotedText}<br>
                    ご利用ありがとうございました。
                </p>
            </div>
        `;
    } catch (err) {
        showStatus(err?.message || 'システムエラーが発生しました。', 'error');
        btn.disabled = false;
        btn.textContent = 'キャンセルを確定する';
    }
}

init();
