// Firebase 共通設定
const firebaseConfig = {
  apiKey: "AIzaSyBqp86LCsX3vGoA3Ug1aBnZbA_oQIVW614",
  authDomain: "quziopus.firebaseapp.com",
  projectId: "quziopus",
  storageBucket: "quziopus.firebasestorage.app",
  messagingSenderId: "61719920613",
  appId: "1:61719920613:web:a7002a7378c171f98d790c",
  measurementId: "G-FFP3YGKFDT",
  databaseURL: "https://quziopus-default-rtdb.asia-southeast1.firebasedatabase.app/"
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

