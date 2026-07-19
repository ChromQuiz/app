# CIQ セキュリティ強化計画（設計レビュー / 改善計画）

> **本文書は唯一の親計画（single source of truth）。** P2-e1〜e5、backlog、RLS レビュー、contract/live test 等はすべて
> 子タスクであり、本計画を置き換えない。実装の現状は `docs/security-migration-status.md`（子タスクの実施記録）に記す。
>
> - 対象コミット: `9423c47` ／ レビュー日: 2026-07-08
> - レビュー範囲: `supabase/functions/**`, `supabase/migrations/**`, `js/**`, `*.html`
> - repo への persist: 2026-07-19（会話ベースだった親計画を正典化。以後 Claude Code / Codex / ZCode はこれを参照）
>
> **運用モデル前提（重要）**: CIQ は**単一サービス・単一大会運用**を前提とする（複数プロジェクト＝複数大会の同時運用は基本的に発生しない）。
> このため一般的なマルチテナント SaaS を想定した「project 単位の分離」は必須要件ではない。V4 のレート制限は **IP 単位**とする（後述）。

## 1. 脅威モデル

### 資産（守るべきもの）
| 資産 | 機密性 | 完全性 | 可用性 |
|---|---|---|---|
| 参加者 PII（暗号化 encrypted_pii） | ★★★ | ★★ | ★ |
| 復号鍵（プロジェクト RSA 秘密鍵） | ★★★ | ★★★ | ★★ |
| 答案画像（answer-pages / answer-cells バケット） | ★★★ | ★★★ | ★★ |
| 採点結果・最終順位（final_results） | ★★ | ★★★ | ★★ |
| 当日受付状態（checked_in） | ★ | ★★★ | ★★ |
| メール送信枠（Brevo/SES 無料枠・送信者レピュテーション） | ★ | ★★ | ★★★ |
| 管理者/採点者セッション（Supabase Auth JWT） | ★★★ | ★★★ | ★★ |

### 想定攻撃者
| ID | 攻撃者 | 動機 | 能力 |
|---|---|---|---|
| A1 | 匿名の外部者 | 荒らし・愉快犯 | 公開 URL・anon key・API 直叩き |
| A2 | 正規参加者（悪意） | 他人のなりすまし・優位取得 | 有効な email+パスワード・自分のトークン |
| A3 | 元運営メンバー（removed） | 私怨・データ持ち出し | 過去の Google アカウント |
| A4 | 中間者/端末共有 | セッション窃取 | 公共端末・肩越し・QR スクショ |
| A5 | 供給網 | 広範囲改ざん | CDN・依存ライブラリ侵害 |

### 信頼境界
- ブラウザ ↔ Supabase Data API（anon/authenticated、RLS で防御）
- ブラウザ ↔ Edge Functions（service_role で実行、境界内で認証を自前検証）
- Edge Functions ↔ 外部メールプロバイダ（Brevo/SES）
- ブラウザ ↔ 第三者 CDN（jsDelivr / cdnjs / unpkg）

**設計上の良い前提（実装済み）**: 参加者の書き込み系は全て Edge Function 経由で service_role が状態再検証、RLS は全テーブル有効、機密列は authenticated から revoke 済み、ブラウザには publishable key のみ。基礎は堅い。以下は「数百〜数千人・一般公開」に上げるための差分。

## 2. 攻撃対象領域（Attack Surface）
| 面 | エンドポイント/経路 | 認証 | 備考 |
|---|---|---|---|
| 参加者登録 | create-entry | なし（公開） | CAPTCHA/IP制限なし → 大量登録可 |
| メール認証コード | send-email (send_verification) | なし | 任意宛先へ送信可（メール爆撃面） |
| 参加者ハブ | my-entry / edit-entry / cancel-entry / mark-late / disclose-result | email+pwハッシュ or 短命トークン | HMAC 署名鍵の設定が鍵 |
| 当日受付 | check-in / checkin-qr / admin-entry-qr | 運営 JWT / 署名付URL | QR 本体は素の entry UUID |
| 管理 | admin-create-entry / project-key | 運営 JWT（owner/admin） | RSA 秘密鍵の払い出し面 |
| Data API 直 | PostgREST projects/entries/... | anon/authenticated + RLS | RLS が最終防衛線 |
| Realtime | public_entry_list | anon（entry_open時） | entry UUID が公開される |
| フロント | 8 HTML ページ + 第三者 CDN | — | CSP あり・SRI なし |

## 3. 脆弱性一覧
各項目: 重大度 / 攻撃シナリオ / 影響 / 修正方針 / 対象ファイル / 優先度。

| # | 項目 | 重大度 | 攻撃シナリオ | 影響 | 修正方針 | 優先度 |
|---|---|---|---|---|---|---|
| V1 | HMAC 署名鍵のフォールバックが公開値/固定値 | Critical（要確認） | 本番で `CIQ_EMAIL_SIGNING_SECRET`/`CIQ_EDGE_INTERNAL_SECRET` 未設定だと署名鍵が `SUPABASE_URL`（公開）または固定文字列にフォールバック。攻撃者が同鍵で参加者トークンを自己発行しなりすまし。checkin-qr URL も偽造可 | 参加者認証の完全バイパス・PII/成績閲覧・編集・キャンセル | フォールバック削除・未設定なら起動時例外・本番 env に 32byte 以上のランダム秘密を必須化・鍵ローテーション手順を文書化 | P0 |
| V2 | メール送信オラクル（send_verification が無認証） | High | A1 が任意の `to` を指定し認証コードメール送信。レート制限は recipient_hash 単位（5通/10分）なので宛先を変えれば無制限 | メール爆撃、無料枠消費で全参加者へのメール停止、SPAM 認定 | IP/セッション単位のレート制限追加、Turnstile/hCaptcha を認証コード発行前に必須化、1プロジェクト日次送信上限、create-entry にも同様の制限 | P0 |
| V3 | 開示パスワード/メールが無塩 SHA-256 | High | DB 流出時、無塩ハッシュをレインボー/総当たりで復元・メール列挙 | 参加者アカウント奪取・PII 相関・メール逆引き | サーバ側で HMAC(pepper) 化。既存行は移行スクリプトで再計算 | P1 |
| V4 | 参加者認証のグローバル/IP レート制限なし | High | A1/A2 が複数 email_hash・複数 IP から並列で総当たり。失敗記録は email_hash 単位（10回/10分）のみ | 認証総当たり・列挙・DoS | **IP 単位**のレート制限層（Edge 冒頭で共通化）、超過で 429、生 IP を保存しない。※運用モデル前提により project 分離は不要（下記注記） | P1 |
| V5 | CORS Allow-Origin: * + API 直叩き耐性 | Medium | 全 Edge が全オリジン許可。任意サイトから叩ける | 自動化された乱用・スクレイピング・各攻撃の増幅 | 本番オリジンの allowlist 化、入力バリデーション強化、レート制限で実質担保 | P1 |
| V6 | エラーメッセージから内部情報漏洩 | Medium | 500 経路で `error.message` を返却。DB 制約名・SQL 断片が露出 | 内部スキーマ推測・攻撃の足がかり | 例外を分類し汎用文言（要確認 ID）のみ返す。詳細は console.error。共通ハンドラ化 | P1 |
| V7 | QR 本体が素の entry UUID（署名なし・使い回し無期限） | Medium | A4 が他人の QR を提示 → 運営端末が受付処理 | なりすまし受付・受付状態の完全性低下 | QR を HMAC(entryId+nonce+exp) 署名付きに、または受付時に受付番号照合を必須化 | P2 |
| V8 | 第三者 CDN スクリプトに SRI なし（供給網） | Medium | A5 が CDN 上のライブラリを改ざん → 任意 JS 実行 | XSS 相当・鍵/PII 窃取 | 依存をセルフホスト or SRI+版固定。CSP から不要 CDN 削除 | P2 |
| V9 | RSA 秘密鍵が localStorage 保持（XSS 時に露出） | Medium | XSS で `localStorage.privateKeyJwk` を窃取 → 全 PII 復号 | 全 PII 復号 | session 限定保持、CSP 強化、fetch 頻度最小化 | P2 |
| V10 | 参加者/service_role 操作が監査ログ外 | Medium | 参加者系は service_role 実行で `auth.uid()` null → 証跡が残らない | インシデント追跡不能 | service_role 用の監査挿入経路（種別=participant、IP/ID のみ、PII なし） | P2 |
| V11 | removed メンバーの JWT 失効はポリシー依存 | Low | 除名直後も JWT 有効期間中は認証が通る。check-in は `status <> 'removed'` のみ | 除名直後の短時間、権限残存 | check-in を owner/admin/scorer の active 明示に統一 | P3 |
| V12 | 大量登録（create-entry）へのボット対策なし | Low〜Medium | 自動で偽エントリ大量投入 | 枠占有 DoS・運営混乱 | CAPTCHA、メール認証コード完了を登録の前提に、1メール1エントリ制約＋IP レート | P2 |
| V13 | 依存の浮動バージョン（Edge 側） | Low | esm.sh の浮動指定。上流侵害/破壊的更新 | 予期せぬ挙動変化・供給網 | import をパッチ版まで固定、deno.lock 導入、定期確認 | P3 |

## 4. 重大度ランキング
1. V1 Critical / 2. V2 High / 3. V3 High / 4. V4 High / 5. V5 Medium / 6. V6 Medium / 7. V7 Medium / 8. V8 Medium / 9. V9 Medium / 10. V10 Medium / 11. V12 Low〜Med / 12. V11・V13 Low

### 要確認事項（推測で実装しない）
- 🔲 本番に `CIQ_EMAIL_SIGNING_SECRET`（または `CIQ_EDGE_INTERNAL_SECRET`）が設定済みか（V1 の重大度の分岐点）→ **確認済み: 設定済み（2026-07-08）**
- 🔲 `PROJECT_KEY_ENCRYPTION_SECRET` の強度（32byte 以上か）
- 🔲 メールプロバイダ（Brevo/SES）の日次送信上限と現状の消費
- 🔲 public_entry_list を一般公開運用で使うか（entry UUID 公開の可否）
- 🔲 CAPTCHA 導入可否（UX 制約・学生団体の運用許容度）＝**外部サービス導入のため要ユーザー判断**

## 5. Phase 1 / 2 / 3 改善計画
- **Phase 1 — 「一般公開の前提条件」**（既存コード活用・破壊的変更なし）: V1 フォールバック撤去＋env、V2 IP レート＋CAPTCHA＋日次上限、V6 共通エラーハンドラ、V4 IP レート制限。
- **Phase 2 — 「多層防御・データ保護」**: V3 pepper、V5 CORS allowlist、V8 SRI/セルフホスト、V12 登録メール認証必須、V10 監査ログ。
- **Phase 3 — 「堅牢化・運用」**: V7 QR 署名、V9 鍵 session 化、V11/V13 除名判定統一・依存固定、統合回帰テスト・可観測性。

## 6. 実装優先順位
- **P0（公開前必須）**: V1 → V2
- **P1（公開直後の初週）**: V6 → V4 → V3 → V5
- **P2（1か月以内）**: V8 → V12 → V7 → V10 → V9
- **P3（継続）**: V11 → V13 + テスト/監視整備

## 7. テスト計画（要旨）
単体（Vitest）／RLS・Grant（PostgREST 直叩き）／Edge（署名鍵未設定で起動失敗・無効トークン拒否・CORS 拒否・レート超過 429・CAPTCHA 無しで拒否）／認証バイパス回帰／メール乱用／QR／回帰（`npm test`・`node --check`・`git diff --check`）。各 Phase 完了時に該当分をゲートにする。

## 8. ロールバック計画（要旨）
小さく可逆に。Edge は関数単位で旧版へ即時再デプロイ。migration は down 手順を用意し破壊的な列削除はしない（新列追加→二重書き→検証→切替）。CAPTCHA/レート制限は env フラグで ON/OFF。判断基準＝正規参加者エラー率・受付停止・メール不達で該当 Phase を revert。

## 9. 設計原則
1. フロント検証は UX のみ、認可は必ず Edge+RLS で二重化。2. 秘密鍵はブラウザに出さない・env フォールバックを持たない。3. 公開 API はレート制限＋CAPTCHA を前提に「直叩きされても壊れない」。4. すべての状態変更は監査可能。CAPTCHA・レート制限・監視は Supabase 無料枠＋Cloudflare 無料枠内で完結する構成とする。

---

## 付録A: 署名鍵ローテーション手順（V1 完了条件）

対象秘密: `CIQ_EMAIL_SIGNING_SECRET`（無ければ `CIQ_EDGE_INTERNAL_SECRET`）。用途＝参加者短命トークン・受付 QR・
メール認証コードの HMAC 署名（`_shared/signing.ts`）。**32byte 以上（`openssl rand -hex 32` = 64 hex 文字）必須。**未設定/短すぎると
`SigningConfigError` で該当機能は停止する（fail-closed）。

手順（低トラフィック時間帯に実施）:
1. 新しい鍵を生成: `openssl rand -hex 32`
2. 本番へ投入: `supabase secrets set CIQ_EMAIL_SIGNING_SECRET=<new> --project-ref pyzdlkwumhreepgkrcyb`
3. 署名鍵を使う Edge Function を再デプロイして確実に反映:
   `send-email` / `checkin-qr` / `my-entry` / `edit-entry` / `cancel-entry` / `mark-late` / `disclose-result`
   （participant_auth 経由のトークン検証・QR 再表示を含む）
4. 反映確認: `GET /functions/v1/checkin-qr?d=<uuid>&s=deadbeef` が **404**（＝鍵設定済み・長さ充足）を返すこと。503 なら未反映。

影響（不可逆な失効）:
- 旧鍵で発行済みの**参加者セッショントークンは全て無効化**→ 参加者は my.html で再ログインが必要。
- 旧鍵で署名済みの**受付 QR URL・メール内 QR は検証不能**になる → my.html は再表示で新 QR を生成。配布済みメール内 QR は無効。
- よってローテーションは大会当日直前〜当日は避ける（受付 QR 失効を防ぐ）。

ロールバック: 旧鍵を `supabase secrets set` で再投入し、上記 Edge を再デプロイすれば旧トークン/QR が再び有効化する
（旧鍵を安全に保管している場合のみ）。

## 注記・変更履歴（親計画の改定ログ）

### 2026-07-19 — V4 の完了条件を IP 単位へ改定（運用モデルに整合）
初期計画は「IP + project 単位のレート制限」を想定していたが、これは一般的なマルチテナント SaaS 前提の設計だった。
**CIQ は単一サービス・単一大会運用を前提とするため、複数プロジェクトの同時運用は基本的に発生せず、project 単位の分離は不要。**
よって **V4 のレート制限は IP 単位とする**。V4 の完了条件を以下へ改定する（「IP × project であること」は完了条件から除外）:

- 同一 IP からの総当たり・列挙攻撃を防止できること
- 閾値超過時に 429 を返すこと
- 生 IP を保存せず、安全に追跡できること（HMAC 化した scope_key のみ保存）
- **並列アクセスでも制限を突破できないこと**
- 運用上、制限発動状況を確認できること

この改定に伴い、`participant_auth_events` への `ip_hash` 列追加は行わない（IP 追跡は `rate_limit_events` の HMAC scope_key で満たすため）。
現行実装（`rate_limit_events` + HMAC 化 IP scope_key + 共通 IP レート制限層）が上記を満たす部分は「初期案をより実運用に適した設計へ更新した（Superseded）」として扱う。
