/**
 * QuizOpus 共通ユーティリティ (shared.js)
 * 
 * 全ページで使い回す関数・定数を集約。
 * config.js, crypto.js の後に読み込むこと。
 */

// Firebase REST API ベースURL
const FIREBASE_REST_BASE = 'https://quziopus-default-rtdb.asia-southeast1.firebasedatabase.app';

/**
 * データベース認証エラー表示
 * PERMISSION_DENIED 時に呼び出す共通オーバーレイ
 */
function showDbAuthError() {
    const div = document.createElement('div');
    div.className = 'error-overlay';
    div.innerHTML = `
        <div class="error-dialog">
            <h2><i class="fa-solid fa-triangle-exclamation"></i> データベース通信拒否</h2>
            <p>データベースへの接続が拒否されました。<br><br><br>運営者にお問い合わせください。</p>
            <button class="btn danger" onclick="location.href='index.html'"><i class="fa-solid fa-arrow-left"></i> ログイン画面へ戻る</button>
        </div>
    `;
    document.body.appendChild(div);
}

/**
 * PERMISSION_DENIED の自動ハンドリング
 */
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('PERMISSION_DENIED')) {
        event.preventDefault();
        document.body.innerHTML = '';
        showDbAuthError();
    }
});

/**
 * ログアウト — セッションを破棄してトップへ
 */
function logout() {
    session.clear();
    location.href = 'index.html';
}

/**
 * masterData をローカルストレージから取得
 * @param {string} projectId
 * @returns {Object} { [entryNumber]: { name, affiliation?, grade? } }
 */
function getMasterData(projectId) {
    try {
        return JSON.parse(localStorage.getItem(`masterData_${projectId}`) || '{}');
    } catch (e) {
        return {};
    }
}

/**
 * 答案画像プレビューオーバーレイ
 * question.html / conflict.html で共通利用
 * @param {string} projectId
 * @param {string} secretHash
 * @param {number|string} entryNum
 */
async function showPreview(projectId, secretHash, entryNum) {
    let overlay = document.getElementById('preview-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'preview-overlay';
        overlay.className = 'preview-overlay';
        document.body.appendChild(overlay);
    }
    const masterData = getMasterData(projectId);
    const name = masterData[entryNum]?.name || `受付番号 ${entryNum}`;

    overlay.innerHTML = `
        <div class="preview-header">
            <h2><i class="fa-solid fa-file-image"></i> ${name} の解答用紙</h2>
            <button class="preview-close" onclick="document.getElementById('preview-overlay').style.display='none'">✕ 閉じる</button>
        </div>
        <div id="preview-content" style="text-align:center">
            <div style="color:#aaa"><i class="fa-solid fa-spinner fa-spin"></i> 読み込み中...</div>
        </div>`;
    overlay.style.display = 'block';

    const snap = await db.ref(`projects/${projectId}/protected/${secretHash}/answers/${entryNum}/pageImage`).get();
    const pc = document.getElementById('preview-content');
    if (snap.exists()) {
        pc.innerHTML = `<img src="${snap.val()}" alt="${name}" style="max-width:100%;max-height:85vh;border-radius:8px;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.5)">`;
    } else {
        pc.innerHTML = '<div style="color:#aaa;padding:40px">ページ画像が保存されていません。管理画面から答案を再読み込みしてください。</div>';
    }
}

// Escキーでプレビューを閉じる
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const o = document.getElementById('preview-overlay');
        if (o) o.style.display = 'none';
    }
});

/**
 * 認証チェック。セッション不正なら index.html へリダイレクト。
 * @param {Object} opts
 * @param {boolean} [opts.requireAdmin=false] - admin ロール必須か
 * @returns {{ projectId, secretHash, scorerName, scorerRole }} セッション情報
 */
function requireAuth(opts = {}) {
    const projectId = session.projectId;
    const secretHash = session.get('secretHash');
    const scorerName = session.scorerName;
    const scorerRole = session.scorerRole;

    if (!projectId || !scorerName) {
        location.href = 'index.html';
        return null;
    }
    if (opts.requireAdmin && scorerRole !== 'admin') {
        document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#f87171;font-weight:bold;">管理者としてプロジェクトに入室してください。3秒後にトップページへ戻ります。</div>';
        setTimeout(() => location.href = 'index.html', 3000);
        return null;
    }
    return { projectId, secretHash, scorerName, scorerRole };
}
