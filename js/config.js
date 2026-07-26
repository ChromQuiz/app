// セッション管理ヘルパー（localStorageベースに統一）
const session = {
  get(key) { return localStorage.getItem(key); },
  set(key, val) { localStorage.setItem(key, val); },
  clear() {
    const projectId = localStorage.getItem('projectId');
    ['projectId', 'projectName', 'scorer_name', 'scorer_role', 'secretHash', 'adminHash', 'privateKeyJwk', 'supabaseMode'].forEach(k => localStorage.removeItem(k));
    // 秘密鍵は sessionStorage 側にも存在しうる(V9)
    try { sessionStorage.removeItem('privateKeyJwk'); } catch { /* noop */ }
    // masterData キャッシュも削除
    if (projectId) localStorage.removeItem(`masterData_${projectId}`);
  },
  get projectId() { return this.get('projectId'); },
  get scorerName() { return this.get('scorer_name'); },
  get scorerRole() { return this.get('scorer_role'); }
};

// プロジェクト RSA 秘密鍵の保管(V9)。
// localStorage には置かない: XSS で盗まれた場合に全参加者 PII を復号されるため、
// タブを閉じれば消える sessionStorage に限定する(タブごとに project-key から取り直す)。
// 旧バージョンが localStorage に残した鍵は、読み出し時に sessionStorage へ移して localStorage から消す。
const projectKeyStore = {
  KEY: 'privateKeyJwk',
  get() {
    try {
      const legacy = localStorage.getItem(this.KEY);
      if (legacy) {
        // 旧保管場所からの移行: 一度だけ sessionStorage へ移し、localStorage からは削除する。
        try { sessionStorage.setItem(this.KEY, legacy); } catch { /* storage 不可でも続行 */ }
        localStorage.removeItem(this.KEY);
        return legacy;
      }
      return sessionStorage.getItem(this.KEY);
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      sessionStorage.setItem(this.KEY, value);
      localStorage.removeItem(this.KEY);   // 取り違え防止(旧値を残さない)
    } catch { /* storage 不可でもページ内の処理は続行 */ }
  },
  clear() {
    try {
      sessionStorage.removeItem(this.KEY);
      localStorage.removeItem(this.KEY);
    } catch { /* noop */ }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof CIQEmail !== 'undefined') {
    CIQEmail.configure();
  }
});
