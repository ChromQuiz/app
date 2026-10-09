-- 画面(anon / authenticated)に、使わない強い権限を付けたままにしない。
--
-- Supabase は、新しいテーブルに、anon と authenticated へ TRUNCATE・REFERENCES・TRIGGER(と MAINTAIN)まで付ける。
-- アプリは、これらを一切使わない(読み書きは、RLS と security definer の関数を通る)。
-- PostgREST 経由では TRUNCATE を実行できないので、悪用はできないが、
-- RLS は TRUNCATE に効かないため、将来 SQL を直接受ける経路ができたときの被害が大きい。付けたままにしない。
--
-- 既存の12テーブル(ビュー含む)から外し、今後 postgres が作るテーブルにも付けない。

revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

notify pgrst, 'reload schema';
