// Firebase 共通設定
const firebaseConfig = {
  apiKey: "AIzaSyDk-RpKCX5Hd-xNnrso_x5fd3S-vUoWKUc",
  authDomain: "ciq-saiten.firebaseapp.com",
  databaseURL: "https://ciq-saiten-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ciq-saiten",
  storageBucket: "ciq-saiten.firebasestorage.app",
  messagingSenderId: "987606904586",
  appId: "1:987606904586:web:b16876b8963a55a60d94f3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// システム共通のGAS連携URL（メール送信API）
// ここにデプロイしたGASのURLを貼り付けます
const SYSTEM_GAS_URL = "https://script.google.com/macros/s/AKfycbzCWmgdMJ_a2-oMs08lGu30XBiKhNQrbBFT8mBP2HxuX_g_hnLfk3BQbfMfH-A17eVi/exec";

// セッション管理ヘルパー（localStorageベースに統一）
const session = {
  get(key) { return localStorage.getItem(key); },
  set(key, val) { localStorage.setItem(key, val); },
  clear() { localStorage.removeItem('projectId'); localStorage.removeItem('scorer_name'); localStorage.removeItem('scorer_role'); },
  get projectId() { return this.get('projectId'); },
  get scorerName() { return this.get('scorer_name'); },
  get scorerRole() { return this.get('scorer_role'); }
};

// パスワードハッシュ化ユーティリティ (SHA-256)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
