# Security Migration Status — 参加者ハッシュ v1→v2 移行と残件

この文書は、参加者認証ハッシュの **無塩 SHA-256 (v1) → pepper 付き (v2)** 移行（社内呼称 P2-e1〜P2-e5）の
正式な記録であり、以後のセキュリティ作業の **正典（single source of truth）** とする。
P2-e1〜P2-e5 は会話ベースで設計・レビュー・実装したため元々 repo に計画書は存在しなかった。本文書化以降は、
Claude Code / Codex / ZCode いずれのエージェントも本ファイルを参照して継続すること（セッションの記憶に依存しない）。

- 対象テーブル: `public.entries`
- 対象の旧列: `email_hash` / `disclosure_password_hash`（クライアントの無塩 SHA-256）
- 置換後: `email_hash_v2` / `disclosure_password_hash_v2`（Edge 内 pepper 化。クライアント供給 v2 は信用しない）
- 独立用途で **維持**（本移行の対象外）: `participant_auth_events.email_hash`（レート制限キー）、
  `email_events.recipient_hash`、メール認証トークンの hash（`_shared/email_verify.ts`）

> 検証強度の表記: **観測**=本番/検証環境で実際に駆動して確認 / **静的**=コード・定義・diff で確認 /
> **状態証跡**=現在の DB/デプロイ状態が結果を裏づける。P2-e5 は本セッションで詳細検証済み。
> P2-e1〜e4 は各実施セッションで対応済みで、本文書は commit/migration の実証跡に基づき再構成した
> （**P2-e2 / P2-e3 / P2-e4 の境界は当時ラベル未記載**のため、下記の段階区分は commit 証拠からの再構成。
> migration は "P2-e4" のみ明記あり）。

---

## 1. 移行フェーズ（P2-e1〜P2-e5）

### P2-e1 — v2 受け皿の追加（非破壊）
- **実施**: `entries` に `email_hash_v2` / `disclosure_password_hash_v2` 列と検索用の**非 unique** index
  `entries_email_hash_v2_idx` を追加。`create_entry_atomic` を v2 引数付きの単一関数へ置換（overload を残さない）。
  `_shared/participant_hash.ts` を**休眠モジュール**として追加（この時点では import しない）。
- **完了日**: 2026-07-12
- **commit**: `e4764fe` (Add participant hash v2 foundation)
- **migration**: `202607080005_participant_hash_v2.sql`
- **deploy**: DB migration のみ（Edge 挙動変化なし）
- **検証**: 追加のみ・既存列/データ/旧 index 不変（静的）

### P2-e2 — dual-write 配線（entry 作成で v2 も書込開始）
- **実施**: `create-entry` / `admin-create-entry` が pepper 化 v2 を生成し、旧列と v2 を**両方書込（dual-write）**するよう配線。
- **完了日**: 2026-07-12
- **commit**: `62a1e2e` (Dual-write participant hash v2 on entry creation)
- **deploy**: `create-entry` / `admin-create-entry`（dual-write 開始）
- **検証**: 以後の新規行は旧列と v2 の両方を保持（状態証跡）
- **注**: フェーズラベルは当時未記載。commit 証拠から再構成。

### P2-e3 — v2 移行完了（backfill・v2 主体への切替準備）
- **実施**: 既存行の v2 を一度だけ埋める内部 backfill 関数を導入・実行し、完了後に撤去。
  dual-write の定常化とあわせ、**全行で v2 が揃い v2 主体へ切替可能な状態を確立**（この時点では認証はまだ旧経路主体）。
- **完了日**: 2026-07-12〜14
- **commit**: `9f895bb` (Add temporary participant hash backfill function) /
  `2e307ee` (Allow one-time internal participant hash backfill) /
  `9c75e09` (Remove temporary participant hash backfill function)
- **deploy**: backfill 関数の一時導入 → 実行 → 撤去（恒久 Edge の挙動変化なし）
- **検証**: 全行で v2 両列が非 NULL＝backfill 完遂（状態証跡：現在 v2_null=0）
- **注**: フェーズラベルは当時未記載。commit 証拠から再構成。

### P2-e4 — 認証・キャンセル経路の v2 切替
- **実施**: `_shared/participant_auth.ts` を導入し、**credential 認証を v2 化**（当初は旧列 fallback つき、0 件と DB エラーを区別する
  v2 lookup の堅牢化）。**token 認証を id 経路化**し、認証済み entry を id で扱う `cancel_entry_by_id_atomic` を追加して
  `cancel-entry` を id 経路へ移行。security event テーブルへの service_role 付与を補正。
  → **参加者の認証・キャンセルの主経路が v2 / id へ切り替わったのはこのフェーズ**（v1 旧列はまだ存在＝fallback 可）。
- **完了日**: 2026-07-14
- **commit**: `d49511e` (Use participant hash v2 for credential authentication) /
  `d674abc` (Fix participant v2 credential lookup zero-row handling)
- **migration**: `202607140001_cancel_entry_by_id_atomic.sql` / `202607140002_grant_service_role_security_events.sql`
- **deploy**: `my-entry` / `edit-entry` / `cancel-entry` / `mark-late` / `disclose-result`
- **検証**: v2 credential 認証が成立、id 経路キャンセル稼働（当時セッションで対応）
- **注**: e2/e3/e4 の境界ラベルは再構成。migration は "P2-e4" と明記。

### P2-e5 — 旧列依存の撤去と物理削除（本セッション・2026-07-17）
本フェーズは ①reader / ②writer / ②.5 遊休ゲート / ③撤去 の順で実施。**詳細検証済み**。

- **①-a reader（participant_auth）**: credential=v2 単独（旧列 fallback 撤去）、token=署名検証済み `entryId` を
  `id + project_id` で解決（旧 `email_hash` 照合を撤去、token 形式不変）。commit `a2bcd4d`。
- **①-b reader（send-email / list / フロント）**: `send-email` は送信先メールから Edge 内で v2 生成し
  `email_hash_v2` と直接照合（**caller 供給 hash 非依存**）。`list_entries_for_admin` は hash を返さない。
  フロント（email.js / my.js / admin*.js / entry.js）は send-email へ hash を送らない。
  commit `ae2666b` / `6410d58`、migration `202607140003_list_entries_for_admin_drop_email_hash.sql`。
- **② writer**: `create_entry_atomic` は v2 のみ INSERT（v2 必須ガード）。旧引数は後方互換で残置し INSERT しない。
  v2 アクティブ一意索引 `entries_active_email_unique_v2_idx` を**先に作成**して一意性を連続維持。
  `create-entry` / `admin-create-entry` は旧 RPC 引数を送らない。commit `a1d4fa6`、
  migration `202607140004_create_entry_atomic_v2_only_writes.sql`。
- **②.5 遊休ゲート**: reader/writer/フロントの旧列参照 0、独立用途は維持、post-② 実登録行が
  `email_hash IS NULL / disclosure_password_hash IS NULL / v2 両列 NOT NULL` を満たすことを確認（正常系を本番実データで実証）。
- **③ 撤去（不可逆）**: v2 両列 SET NOT NULL、旧 unique index `entries_active_email_unique_idx` 削除、
  旧 cancel RPC `cancel_entry_atomic(text,text,text)`（dead）削除、旧列
  `email_hash` / `disclosure_password_hash` を DROP。commit `bb5ff6b`、
  migration `202607140005_drop_legacy_participant_hash_columns.sql`。
- **完了日**: 2026-07-17
- **deploy**: `participant_auth` を使う 5 関数（my-entry / edit-entry / cancel-entry / mark-late / disclose-result）、
  `send-email`、`create-entry`、`admin-create-entry` を再デプロイ（すべて ACTIVE / verify_jwt=False）。
  フロントは GitHub Pages（push で公開）。
- **検証（観測）**:
  - スキーマ: 旧列消失、v2 両列 NOT NULL、旧 unique index 消失、v2 unique index UNIQUE/VALID、
    旧 cancel RPC 消失、`create_entry_atomic` / `cancel_entry_by_id_atomic` 健在、旧列参照関数 0、pending 空。
  - 動作: 重複登録→**23505 拒否**（v2 index が enforce）、credential 誤り→**404**、
    `send-email` は emailHash 無しでも「情報不足 400」にならない（bogus entry の 500 は
    **既知の not-found 経路の現行仕様を確認**したものであり、本移行による新規回帰ではない）。
  - データ: total 134、v2_null 0、v2 形式不正 0、active v2 重複 0、entry_number 重複 0、status 分布健全。
- **状態**: ✅ 完了

---

## 2. 現状のセキュリティ残件

### 2-A. 今回の v2 移行とは独立した残課題（実施すべき）
- **RLS / 公開・認証 Edge Function の回帰テスト整備**（最重要）。private テーブル・storage への未認証アクセス拒否、
  および `entries` 機密列（`encrypted_pii` / v2 hash）の列レベル制限の回帰チェックを含む。
  出典: `docs/known_limitations.md`「Security Testing」、`docs/roadmap.md:25`、`docs/project-improvement-plan.md:52-53`。
- **全公開/認証データフローのセキュリティレビュー**（roadmap で In Progress）。出典: `docs/roadmap.md:20`。
- **`public_entry_list` 公開範囲の妥当性の定期確認**。`202607170002_public_entry_list_always_public.sql` で
  非 canceled 行を全ロール SELECT 可にした（PII 非保持を前提）。前提が変わる場合は再評価。

### 2-B. 将来改善項目（優先度低／付随）
- `create_entry_atomic` の**後方互換 死引数** `p_email_hash` / `p_disclosure_password_hash` の除去
  （P2-e5 の後始末。signature 整理。DROP+CREATE と PostgREST reload を要し、機能影響なし）。
- JS/CSS の cache-bust バージョン戦略の一元化（運用衛生。出典 `docs/project-improvement-plan.md:63`）。
- アクセス制御ヘルパ・レンダラのエスケープ・アップロード検証の focused テスト追加（出典 `:64`）。

---

## 3. 優先度順セキュリティバックログ

名称は P2-e◯ に拘らず、優先度で管理する（参加者ハッシュ移行は完了済み）。

| # | 項目 | 種別 | 優先 | 根拠 |
|---|------|------|------|------|
| 1 | RLS ＋ 公開/認証 Edge Function の回帰テストスイート整備 | 独立残課題 | 高 | **In Progress（コア完了）** — §4 実施ログ参照 |
| 1b | authenticated ロール（scorer/member）の実行時 RLS 検証（テスト用 JWT フィクスチャ要） | 独立残課題 | 中 | #1 の follow-on。実ユーザー JWT が必要で自律生成不可 |
| 2 | `entries` 機密列（encrypted_pii / v2 hash）の列レベル制限の回帰テスト | 独立残課題 | 高 | **完了**（§4・security_live.test.mjs で anon 実測） |
| 3 | 全公開/認証データフローの一括セキュリティレビュー（RLS・grant・policy・client 経路） | 独立残課題 | 中 | **In Progress** — §4 に Edge 認可ゲートのレビュー＋回帰を記録。RLS/policy 網羅は継続 |
| 4 | `public_entry_list` 公開範囲の妥当性レビュー（PII 非保持前提の再確認） | 独立残課題 | 中 | **完了**（§4・レビュー＋列 allowlist 回帰テスト） |
| 5 | `create_entry_atomic` 死引数の除去（P2-e5 後始末） | 将来改善 | 低 | 機能影響なし・整理目的 |
| 6 | cache-bust バージョン戦略の一元化 | 将来改善 | 低 | 運用衛生 |
| 7 | アクセス制御/エスケープ/アップロード検証の focused テスト | 将来改善 | 低 | 回帰網の補強 |
| 8 | anon から非データ権限（REFERENCES / TRIGGER / TRUNCATE）を revoke（defense-in-depth） | 将来改善 | 低 | §4 所見。Data API 非露出で悪用不可だが最小権限化。grant migration 要（保留） |

---

## 4. 実施ログ（§5 テンプレート適用・P2-e5 以降）

### RLS・公開/認証 Edge Function の回帰テスト（backlog #1・第1弾）
```
Status  : In Progress（コア完了）— 2026-07-17
Evidence:
  - Files      : tests/security_contract.test.mjs（オフライン static・常時実行）
                 tests/security_live.test.mjs（live anon・CIQ_LIVE=1 で opt-in・read-only）
  - Commits    : 本エントリと同一 commit（tests/security_*.test.mjs 追加）
  - Migrations : なし（テスト追加のみ）
  - Deploys    : なし
  - Verification:
    - 観測: `npx vitest run` = 56 passed（security_contract 18 を含む）/ live 8 は既定 skip / 既存テスト回帰なし
    - 観測: `CIQ_LIVE=1 npx vitest run tests/security_live.test.mjs` = 8 passed
             （anon は entries.encrypted_pii / v2 hash / 旧 v1 列 / project_private_keys /
              participant_auth_events を読めず、membership は RLS で 0 行、public_entry_list は PII-free）
Rollback: Possible（テストのみ・機能/スキーマ影響なし）
Notes   : カバー=参加者認証 v2 不変条件（Edge source）＋ anon 実行時 RLS/列制限（live）。
          未カバー=authenticated ロール（scorer/member）の実行時 RLS（backlog #1b、実 JWT フィクスチャ要）。
```

### public_entry_list の公開範囲レビュー（backlog #4）
```
Status  : Completed — 2026-07-17
Evidence:
  - Files      : tests/security_contract.test.mjs（public_entry_list 列 allowlist 回帰）/
                 tests/security_live.test.mjs（anon 実測で PII-free）
  - Commits    : 本エントリと同一 commit
  - Migrations : なし（レビュー＋テストのみ）
  - Deploys    : なし
  - Verification:
    - 静的: `public_entry_list` はトリガ同期テーブル（202606260003 で明示列挙）。列は
            project_id / entry_id / entry_number / entry_name / affiliation / grade / message /
            is_chubu / status / checked_in / created_at / updated_at のみ。
            encrypted_pii・email・email_hash・disclosure_password_hash を含まない（回帰テスト化）。
    - 観測: anon 実測で public_entry_list は上記機密フィールドを返さない。`public_project_settings` は
            RSA 公開鍵のみで秘密情報なし。
Rollback: Possible（レビュー＋テストのみ）
Notes   : entry_name / affiliation / grade / message は参加者が入力する公開プロフィールで意図的公開。
          PII 本体（氏名・メール）は encrypted_pii に保持され公開面には出ない。前提が変われば再評価。
```

### Edge Function 認可ゲートのレビュー＋回帰（backlog #3・第1弾）
```
Status  : In Progress — 2026-07-17
Evidence:
  - Files      : tests/security_contract.test.mjs（"Edge Function authorization gates" describe）
  - Commits    : 本エントリと同一 commit
  - Migrations : なし / Deploys : なし
  - Verification:
    - 静的レビュー結果（12 Edge Function の認可）:
      * admin 系（admin-create-entry / admin-entry-qr / project-key）= requireAdminMember で
        active かつ owner/admin ロール必須（JS 比較 or SQL `.in('role',[...])` 形式）
      * check-in = 認証ユーザー＋active(非removed) project member 必須
      * participant 系（cancel-entry / disclose-result / edit-entry / mark-late / my-entry）= resolveParticipantAuth（v2 認証）
      * create-entry = メール認証トークン必須＋IP レート制限
      * send-email = 宛先 v2 所有確認＋IP レート制限
      * checkin-qr = HMAC 署名検証（safeEqual）で 404 gating
    - 観測: `npx vitest run` = 68 passed（認可ゲート assertion を含む）
Rollback: Possible（テストのみ）
Notes   : 各 Function の認可ゲートを回帰化（削除・弱体化で CI 失敗）。未了=RLS ポリシー本文と
          grant マトリクスの網羅的レビュー（backlog #3 継続）、authenticated ロールの実行時検証（#1b）。
```

### RLS / grant マトリクスのレビュー＋回帰（backlog #3・第2弾）
```
Status  : In Progress — 2026-07-17
Evidence:
  - Files      : tests/security_live.test.mjs（anon 攻撃面を網羅：24 assertions）
  - Commits    : 本エントリと同一 commit / Migrations : なし / Deploys : なし
  - Verification:
    - 静的レビュー（service-role introspection・read-only）:
      * 全 public テーブルで RLS 有効。
      * private tables（project_private_keys / participant_auth_events / rate_limit_events）= anon 権限ゼロ。
      * entries / answer_pages / audit_logs / email_events / final_results / model_answers /
        question_scorers / score_events / score_votes = anon に SELECT 権限なし（読取不可）。
      * projects / project_members / public_entry_list / public_project_settings = anon SELECT 可だが RLS で行制御。
      * 書込 RPC（create_entry_atomic / cancel_entry_by_id_atomic）= EXECUTE は service_role のみ。
        admin RPC（list_entries_for_admin / remove_project_member / update_project_member_role）= authenticated のみ。
        has_project_role = PUBLIC（anon は auth.uid()=null で false を返すのみ・情報漏洩なし）。
    - 観測: `CIQ_LIVE=1 …security_live` = 24 passed（anon は 12 private tables 読取不可・
      projects/members は RLS 0 行・特権 RPC 3 種 実行不可）。
Rollback: Possible（テストのみ）
Notes   : 所見=マトリクスは概ね最小権限。低リスク項目=anon に REFERENCES/TRIGGER/TRUNCATE の非データ権限が残る
          （Data API 非露出で悪用不可）→ backlog #8 として最小権限化を保留。
          未了=RLS ポリシー本文（USING/WITH CHECK 式）の1件ずつのレビューは継続対象。
```

## 5. 記載フォーマット（今後のエントリ標準）

以後のセキュリティ施策は「計画書」と「実施記録」を分けず、本文書へ**更新型**で 1 エントリずつ記す。
各エントリは次の項目で統一する（Claude Code / Codex / ZCode 共通の書式）。

```
### <施策名>
Status  : Completed / In Progress / Planned / Deprecated（＋更新日）
Evidence:
  - Commits    : <hash> (message)
  - Migrations : <file>
  - Deploys    : <function / target>
  - Verification: 観測 / 静的 / 状態証跡 のどれで確認したか（未検証は明記）
Rollback: Possible / Not possible / Recovery procedure（不可逆なら理由と復旧不能範囲）
Notes   : 補足・再構成の断り・要確認事項
```

- Status は必ず 4 値のいずれか。Planned から着手したら In Progress、完了で Completed、廃止で Deprecated に更新する。
- Evidence は一次証拠（commit / migration / deploy / verification）を必ず埋める。会話やセッション記憶を根拠にしない。
- Verification は強度を明示（観測 > 静的 > 状態証跡）。未確認・対象外は Notes に分けて書く。
- 上記 §1 の P2-e1〜e5 は本テンプレート導入前の記録。内容は等価だが、体裁の統一が要る場合に順次移行する。

## 6. 初期計画（docs/supabase-phase0.md §9「実装フェーズ Phase 1〜5」）の現状整理

**現状整理のみ（新規設計ではない）。** 判定は現在の repo / 本番デプロイ / migration の実証跡に基づく。
出典の初期計画は Firebase→Supabase 移行の設計書（脅威モデル・RLS・認証フローを含む）。参加者ハッシュ v1→v2 等の
**セキュリティ強化**はこの移行の先の継続トラックで、本文書 §1〜§4 が担う。
※ もし別の「セキュリティ専用フェーズ計画」を指す場合は、repo に persisted なのは本 §9 のみのため、その旨ご指摘を。

### Phase 1 — 基盤 ／ Status: Completed
- [x] Supabase プロジェクト作成・Google OAuth・SQL migration 適用・RLS 適用・Storage バケット+ポリシー・auth JS・index ログイン
- [x] プロジェクト作成＝`202606260004_auth_project_creation` + RLS で実現（専用 `create-project` Function ではなく別実装）

### Phase 2 — 運営・採点 ／ Status: Completed
- [x] メンバー管理＝`invite-member` Function ではなく RPC 群（`202607170001` の update/remove/restore_project_member）＋ admin_settings
- [x] admin JS の Supabase 化・Storage 答案アップロード・judge/question/conflict の Realtime 採点・`final_results`（scoring_flow / conflict_resolution / score_conflicts_rpc）

### Phase 3 — 公開ページ ／ Status: Completed
- [x] create-entry / cancel-entry / edit-entry(=update) / mark-late / disclose-result(=lookup-disclosure) / check-in / public_entry_list + Realtime / send-email(SES) … 全 Edge Function 実在・稼働

### Phase 4 — 仕上げ ／ Status: Completed（1 項目のみ要確認）
- [x] 成績開示・PII 復号＝disclose-result / project-key
- [x] メール認証＝`_shared/email_verify.ts` + verify-code フロー（create-entry がトークン必須）
- [x] CSP / GitHub Pages＝inline script/style 除去済み
- [ ] `seed_test_data` の Supabase 版＝**要確認**（本番機能外の開発補助・未確認）

### Phase 5 — 退役 ／ Status: Completed（一部は外部運用で repo 判定外）
- [x] クライアントの Firebase 撤去＝js/ に firebase 参照 0・README に Firebase 記載なし
- [x] 旧メール送信の Supabase Edge 移管＝send-email
- [~] Firebase プロジェクト停止＝**外部運用操作**のため repo からは判定不可（要確認）

### 移行計画の先＝セキュリティ強化トラック（本文書 §1〜§4 が正典）
- **完了**: 参加者ハッシュ v1→v2 移行（P2-e1〜e5）／機密列制限／public_entry_list PII-free／Edge 認可ゲート回帰／anon RLS・grant マトリクス回帰
- **進行中**: 全公開/認証データフローのセキュリティレビュー（§3 backlog #3・RLS ポリシー本文の逐条レビューが継続）
- **未着手/保留**: authenticated 実行時 RLS（#1b・要 JWT フィクスチャ）／`create_entry_atomic` 死引数除去（#5・保留）／anon 非データ権限の最小化（#8）／cache-bust 一元化（#6）／focused テスト（#7）

## 付記
- **P2-e2 / P2-e3 / P2-e4 のフェーズ境界ラベルは当時コードに未記載**のため、本文書は commit/migration の実証跡から
  再構成した（e2=dual-write 配線、e3=backfill・v2 移行完了、e4=認証/キャンセルの v2 切替）。migration に "P2-e4" の明記あり。
  誤りがあれば当該フェーズの担当セッション記録で補正すること。
- 各 commit ハッシュ・migration 名・現在の DB/デプロイ状態が一次証拠。疑義時はそれらを照合する。
- 更新方針: 新たなセキュリティ作業を行った際は、本文書の該当セクション（フェーズ記録 or バックログ）を
  同一 commit 内で更新し、DB とリポジトリの記録を一致させる。
