// セッション管理ヘルパー（localStorageベースに統一）
const session = {
  get(key) { return localStorage.getItem(key); },
  set(key, val) { localStorage.setItem(key, val); },
  clear() {
    const projectId = localStorage.getItem('projectId');
    ['projectId', 'projectName', 'scorer_name', 'scorer_role', 'secretHash', 'adminHash', 'privateKeyJwk', 'supabaseMode'].forEach(k => localStorage.removeItem(k));
    // masterData キャッシュも削除
    if (projectId) localStorage.removeItem(`masterData_${projectId}`);
  },
  get projectId() { return this.get('projectId'); },
  get scorerName() { return this.get('scorer_name'); },
  get scorerRole() { return this.get('scorer_role'); }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof CIQEmail !== 'undefined') {
    CIQEmail.configure();
  }
});
