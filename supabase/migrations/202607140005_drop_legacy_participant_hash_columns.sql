-- P2-e5 ③: 旧参加者ハッシュ列と旧依存オブジェクトを撤去する(不可逆)。
--
-- 前提(②.5 で確認済み + 適用直前に再確認):
--   - reader / writer / フロントは旧列 email_hash / disclosure_password_hash を一切参照・書込しない。
--   - 全行で email_hash_v2 / disclosure_password_hash_v2 が非NULL・v2形式正常・アクティブ重複0。
--   - 旧列に依存する DB オブジェクトは「旧 unique index」と「旧 cancel RPC」のみ
--     (view / RLS policy / trigger / 他関数の参照なし)。create_entry_atomic 本文は旧列非参照。
--
-- ユーザー承認済み: ③ の5点を一括実行(soak なし)。
-- ■不可逆: 既存行の email_hash / disclosure_password_hash データは失われ、
--   v2 認証に障害が出た場合の旧列 fallback 復旧はできなくなる。
-- ■ロールバック(部分的にのみ可能): 列・旧RPC・旧indexは DDL で再作成できるが、
--   旧列の「データ」は復元できない(新規行は元々 NULL、既存行の旧hashは消える)。

-- 1) v2 両列を NOT NULL 化(以後の整合を強制。全行非NULLのため即時成功する)。
alter table public.entries alter column email_hash_v2 set not null;
alter table public.entries alter column disclosure_password_hash_v2 set not null;

-- 2) 旧アクティブ一意索引(email_hash 上)を削除。アクティブ重複防止は
--    entries_active_email_unique_v2_idx(v2 上, UNIQUE/VALID)が引き継ぐ。
drop index if exists public.entries_active_email_unique_idx;

-- 3) 旧 cancel RPC(旧列 email_hash / disclosure_password_hash で本人照合。コード呼び出し0=dead)を削除。
--    現行のキャンセルは cancel_entry_by_id_atomic(token/id 経路)が担う。
drop function if exists public.cancel_entry_atomic(text, text, text);

-- 4) 旧列を削除(不可逆)。依存(旧 index / 旧 RPC)は上で除去済みのため CASCADE は付けない
--    (想定外の依存が残っていれば失敗させ、トランザクションごと巻き戻す)。
alter table public.entries
  drop column email_hash,
  drop column disclosure_password_hash;

-- スキーマ変更(関数削除・列削除)を PostgREST に即時反映させる。
notify pgrst, 'reload schema';
