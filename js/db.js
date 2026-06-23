/**
 * CIQ Firebase Database レイヤ (db.js)
 * config.js の後に読み込むこと。
 */

const db = firebase.database();
const dbRef = (path) => db.ref(path);
const SERVER_TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;

function waitForAuth() {
    if (firebase.auth().currentUser) return Promise.resolve(firebase.auth().currentUser);
    return Promise.race([
        _authReadyPromise.then(() => firebase.auth().currentUser),
        new Promise(r => setTimeout(() => r(null), 2000))
    ]);
}

async function dbGet(path) {
    try {
        const snap = await dbRef(path).get();
        return snap.val();
    } catch (e) {
        if (e.code === 'PERMISSION_DENIED') { showDbAuthError(); }
        throw e;
    }
}

async function dbSet(path, data) {
    try {
        await dbRef(path).set(data);
        return data;
    } catch (e) {
        if (e.code === 'PERMISSION_DENIED') { showDbAuthError(); }
        throw e;
    }
}

async function dbUpdate(path, data) {
    try {
        await dbRef(path).update(data);
        return data;
    } catch (e) {
        if (e.code === 'PERMISSION_DENIED') { showDbAuthError(); }
        throw e;
    }
}

async function dbRemove(path) {
    try {
        await dbRef(path).remove();
    } catch (e) {
        if (e.code === 'PERMISSION_DENIED') { showDbAuthError(); }
        throw e;
    }
}

async function dbShallow(path) {
    const data = await dbGet(path);
    if (!data || typeof data !== 'object') return data;
    const result = {};
    for (const key of Object.keys(data)) result[key] = true;
    return result;
}

async function dbQuery(path, orderBy, equalTo) {
    const snap = await dbRef(path).orderByChild(orderBy).equalTo(equalTo).get();
    return snap.val();
}

async function dbTransaction(path, updateFn) {
    const result = await dbRef(path).transaction(updateFn);
    return { committed: result.committed, value: result.snapshot.val() };
}

class Poller {
    constructor(path, callback, intervalMs = 3000) {
        this.path = path;
        this._ref = dbRef(path);
        this.callback = callback;
        this.intervalMs = intervalMs;
        this._active = false;
    }

    start() {
        if (this._active) return this;
        this._active = true;
        this._ref.on('value', (snap) => {
            if (this._active) this.callback(snap.val());
        }, (error) => {
            console.error(`Listener(${this.path}) error:`, error);
            if (error.code === 'PERMISSION_DENIED') showDbAuthError();
        });
        return this;
    }

    stop() {
        this._active = false;
        this._ref.off();
        return this;
    }

    restart() {
        this.stop();
        this.start();
        return this;
    }
}

(function() {
    if (typeof firebase === 'undefined' || !firebase.database) return;
    const dbInstance = firebase.database();
    let idleTimer = null;
    const IDLE_TIMEOUT = 10 * 60 * 1000;

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (document.hidden) dbInstance.goOffline();
        }, IDLE_TIMEOUT);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resetIdleTimer();
        } else {
            clearTimeout(idleTimer);
            dbInstance.goOnline();
        }
    });
})();

function showDbAuthError() {
    const publicPages = ['entry.html', 'entry_list.html', 'cancel.html', 'late.html', 'edit.html', 'disclosure.html', 'terms.html'];
    const currentPage = location.pathname.split('/').pop();
    const isPublic = publicPages.includes(currentPage);

    const div = document.createElement('div');
    div.className = 'error-overlay';
    div.innerHTML = `
        <div class="error-dialog">
            <h2><i class="fa-solid fa-triangle-exclamation"></i> 接続エラー</h2>
            <p>データベースへの接続が切断されました。<br><br>${isPublic ? 'ページを再読み込みしてください。' : '再ログインが必要な場合があります。'}</p>
            ${isPublic
                ? '<button class="btn primary" onclick="location.reload()"><i class="fa-solid fa-rotate-right"></i> ページを再読み込み</button>'
                : '<button class="btn danger" onclick="location.href=\'index.html\'"><i class="fa-solid fa-arrow-left"></i> ログイン画面へ戻る</button>'}
        </div>
    `;
    document.body.appendChild(div);
}

window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('PERMISSION_DENIED')) {
        event.preventDefault();
        showDbAuthError();
    }
});

function watchProjectDeletion(projectId) {
    if (!projectId) return;
    let initialized = false;
    dbRef(`projects/${projectId}/publicSettings`).on('value', snap => {
        if (!initialized) { initialized = true; return; }
        if (snap.val() === null) {
            showToast('このプロジェクトは削除されました。ログイン画面に戻ります。', 'error', 5000);
            session.clear();
            setTimeout(() => { location.href = 'index.html'; }, 2000);
        }
    });
}
