# CIQ

マルチテナント対応のリアルタイム採点プラットフォーム。  
ペーパーテスト（クイズ大会等）の **回答用紙PDF生成 → スキャン → 自動採点 → 成績照会** をブラウザだけで完結させます。

## 🏗 アーキテクチャ

```
Browser (静的HTML/JS)  ──── Supabase
                          ├── Auth: 管理者・採点者のGoogleログイン
                          ├── Postgres + RLS: projects / entries / scores
                          ├── Storage: answer-pages / answer-cells
                          ├── Realtime: エントリーリスト・採点状況
                          └── Edge Functions: 参加者公開フロー / SESメール送信
```

## 📁 ファイル構成

```
app/
├── index.html          # ログイン・プロジェクト作成
├── judge.html          # 問題一覧（採点者メインページ）
├── question.html       # 個別問題の採点画面
├── conflict.html       # 採点不一致の確認・確定
├── admin.html          # 管理画面（5タブ構成）
├── checkin.html        # QRコード当日受付
├── entry.html          # エントリーフォーム（公開）
├── entry_list.html     # エントリーリスト（公開）
├── cancel.html         # キャンセルフォーム（公開）
├── disclosure.html     # 成績照会（公開）
├── css/
│   └── design_system.css   # 全ページ共通デザインシステム
├── js/
│   ├── config.js       # セッション管理・共通初期化
│   ├── supabase_config.js # Supabase接続設定（Project URL / publishable key）
│   ├── supabase_client.js # Supabaseクライアント初期化
│   ├── supabase_api.js # Supabase APIアダプタ
│   ├── shared.js       # 共通ユーティリティ (認証, Toast, Menu)
│   ├── crypto.js       # RSA暗号化 (個人情報保護)
│   ├── index.js        # ログイン処理
│   ├── judge.js        # 問題一覧ロジック
│   ├── question.js     # 採点ロジック
│   ├── conflict.js     # 不一致解決ロジック  
│   ├── admin.js        # 管理画面ロジック
│   ├── checkin.js      # QR受付ロジック
│   ├── entry.js        # エントリー送信
│   ├── entry_list.js   # エントリーリスト表示
│   ├── cancel.js       # キャンセル処理
│   ├── disclosure.js   # 成績照会表示
│   ├── cv.js           # OpenCV.js ラッパー（答案スキャン用）
│   └── aruco.js        # ArUcoマーカー検出
├── fonts/
│   └── BIZUDGothic-Subset.ttf  # PDF日本語フォント（サブセット済み）
├── aruco_markers/      # 回答用紙用マーカー画像 (4枚)
└── supabase/           # DB migrations / Edge Functions
```

## 🚀 ローカル起動

```bash
cd app
python3 -m http.server 8080
```

http://localhost:8080/index.html にアクセス。

> **注意**: Supabaseへの接続が必要です。オフラインでは動作しません。

## 🔧 Supabase セットアップ

1. Supabaseプロジェクトを作成
2. `supabase/migrations/` を順番に適用
3. Supabase AuthでGoogleログインを有効化
4. 本番/共有環境では `js/supabase_config.js` にProject URLとpublishable keyを設定
5. ローカル専用の上書きが必要な場合は `js/config.local.js` を作成（未コミット）
6. メールを使う場合はEdge Function SecretsにSES設定を追加

## 🧪 開発時チェック

```bash
npm test
find js -name '*.js' -exec node --check {} \;
git diff --check
```

## 📋 運用フロー

1. **プロジェクト作成**: `index.html` → 「新規作成」→ プロジェクト名・管理者名入力
2. **回答用紙発行**: 管理画面 → 採点準備タブ → 問題数設定 → PDF生成
3. **エントリー受付**: 管理画面 → 参加者タブ → 受付ON/期間設定
4. **当日受付**: `checkin.html` → QRコードスキャンで出欠管理
5. **答案スキャン**: 管理画面 → 答案管理タブ → 複合機スキャン画像アップロード
6. **採点**: `judge.html` → 各問題をタップ → 3名で独立採点 → 不一致は確認画面で確定
7. **成績照会**: 管理画面 → 集計タブ → CSV出力 / 成績照会ON

## 📄 ライセンス

Private
