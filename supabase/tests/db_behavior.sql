-- db_behavior.sql — 本番と同じデータベースの関数・権限を、本物の定義で動かして確かめる。
--
-- 安全性: 全体が 1 つの取引で、最後に必ず rollback する。何も残らない（監査ログ・連番を除く。連番は進むことがある）。
--   途中でエラーになっても、接続が閉じて自動的に巻き戻る。
-- 実行: npx supabase db query --linked --project-ref <ref> -f supabase/tests/db_behavior.sql
--   最後の SELECT が、確認ごとの ok / ng を返す。ng が 1 件でもあれば、結果の detail を見る。
-- 仕組み: auth.users にテスト用のユーザーを入れ、request.jwt.claims と role を切り替えて、
--   「その人としてログインした状態」を再現する（RLS・列の権限・関数の権限を本物で確かめられる）。
-- 注意: 本番のデータには触れない（テスト用の大会 zz-t だけを作る）。auth.users には @example.invalid を入れ、巻き戻す。

begin;

create temp table tr (name text, ok boolean, detail text);
grant all on tr to public;

-- 確認 1 件を記録する
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void language plpgsql as $$
begin
  insert into tr(name, ok, detail) values (p_name, coalesce(p_ok, false), coalesce(p_detail, ''));
end $$;
grant execute on function pg_temp.chk(text, boolean, text) to public;

-- SQL を実行して、例外のメッセージ（なければ 'OK'）を返す
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.err(text) to public;


-- DML を実行して、変わった行数を返す。権限がなくて拒否されたら -1
create function pg_temp.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end $$;
grant execute on function pg_temp.affected(text) to public;

-- その人としてログインした状態にする（reset role で戻す）
create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.as_user(uuid) to public;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;
grant execute on function pg_temp.as_anon() to public;

-- ユーザー
-- 所有者 O / 管理者 A / 採点者 S1, S2, S3 / 外された人 R / 大会に関係のない人 X
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-4000-8000-000000000001', 'o@example.invalid', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000002', 'a@example.invalid', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000003', 's1@example.invalid', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000004', 's2@example.invalid', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000005', 's3@example.invalid', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000006', 'r@example.invalid', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000007', 'x@example.invalid', 'authenticated', 'authenticated');

-- ===== DB-11 create_project_with_owner =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select public.create_project_with_owner('zz-t', 'ZZ Test', '{"kty":"RSA"}'::jsonb, 'enc', 'Owner');
select pg_temp.chk('DB-11 大会を作ると、所有者が登録される',
  (select count(*) from public.project_members where project_id = 'zz-t' and role = 'owner' and user_id = 'a0000000-0000-4000-8000-000000000001' and status = 'active') = 1);
select pg_temp.chk('DB-11 同じ ID の大会は作れない（重複は例外）',
  pg_temp.err($$select public.create_project_with_owner('zz-t', 'ZZ Test 2', '{"kty":"RSA"}'::jsonb, 'enc', 'Owner')$$) <> 'OK',
  pg_temp.err($$select public.create_project_with_owner('zz-t', 'ZZ Test 2', '{"kty":"RSA"}'::jsonb, 'enc', 'Owner')$$));
select pg_temp.chk('DB-11 不正な大会 ID（大文字・短い）は作れない',
  pg_temp.err($$select public.create_project_with_owner('ZZ', 'x', '{}'::jsonb, 'enc', 'o')$$) <> 'OK');
reset role;

select pg_temp.as_anon();
select pg_temp.chk('DB-11 未ログインでは大会を作れない',
  pg_temp.err($$select public.create_project_with_owner('zz-anon', 'x', '{}'::jsonb, 'enc', 'o')$$) <> 'OK',
  pg_temp.err($$select public.create_project_with_owner('zz-anon', 'x', '{}'::jsonb, 'enc', 'o')$$));
reset role;

-- メンバー（ここは裏で入れる。実際の入り方は招待リンク: DB-13）
insert into public.project_members (project_id, user_id, role, display_name, status) values
  ('zz-t', 'a0000000-0000-4000-8000-000000000002', 'admin', 'Admin', 'active'),
  ('zz-t', 'a0000000-0000-4000-8000-000000000003', 'scorer', 'S1', 'active'),
  ('zz-t', 'a0000000-0000-4000-8000-000000000004', 'scorer', 'S2', 'active'),
  ('zz-t', 'a0000000-0000-4000-8000-000000000005', 'scorer', 'S3', 'active'),
  ('zz-t', 'a0000000-0000-4000-8000-000000000006', 'scorer', 'Removed', 'removed');

-- ===== DB-12 メンバーの権限の変更 =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');  -- 管理者として
select pg_temp.chk('DB-12 管理者は、採点者を管理者にできる',
  pg_temp.err($$select public.update_project_member_role((select id from public.project_members where project_id='zz-t' and display_name='S3'), 'admin')$$) = 'OK');
select pg_temp.chk('DB-12 …そして採点者に戻せる',
  pg_temp.err($$select public.update_project_member_role((select id from public.project_members where project_id='zz-t' and display_name='S3'), 'scorer')$$) = 'OK');
select pg_temp.chk('DB-12 所有者の権限は変えられない',
  pg_temp.err($$select public.update_project_member_role((select id from public.project_members where project_id='zz-t' and role='owner'), 'scorer')$$) <> 'OK');
select pg_temp.chk('DB-12 自分自身の権限は変えられない',
  pg_temp.err($$select public.update_project_member_role((select id from public.project_members where project_id='zz-t' and display_name='Admin'), 'scorer')$$) <> 'OK');
select pg_temp.chk('DB-12 所有者は外せない',
  pg_temp.err($$select public.remove_project_member((select id from public.project_members where project_id='zz-t' and role='owner'))$$) <> 'OK');
-- （関数の結果を、同じ文の中の副問い合わせでは読めないので、文を分ける）
select pg_temp.chk('DB-12 採点者を外せる', pg_temp.err($$select public.remove_project_member((select id from public.project_members where project_id='zz-t' and display_name='S3'))$$) = 'OK');
select pg_temp.chk('DB-12 …外すと状態が removed になる', (select status from public.project_members where project_id='zz-t' and display_name='S3') = 'removed');
select pg_temp.chk('DB-12 …復帰できる', pg_temp.err($$select public.restore_project_member((select id from public.project_members where project_id='zz-t' and display_name='S3'))$$) = 'OK');
select pg_temp.chk('DB-12 …復帰すると active に戻る', (select status from public.project_members where project_id='zz-t' and display_name='S3') = 'active');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- 採点者として
select pg_temp.chk('DB-12 採点者は、権限を変えたり外したりできない',
  pg_temp.err($$select public.update_project_member_role((select id from public.project_members where project_id='zz-t' and display_name='S2'), 'admin')$$) <> 'OK'
  and pg_temp.err($$select public.remove_project_member((select id from public.project_members where project_id='zz-t' and display_name='S2'))$$) <> 'OK');
reset role;

-- ===== 大会の設定（以降の確認の前提）=====
update public.projects set entry_open = true, period_start = now() - interval '1 hour', period_end = null,
  max_entries = 2, question_count = 3, required_scorers = 2 where id = 'zz-t';

-- ===== DB-01 create_entry_atomic / DB-02 recompute_entry_statuses =====
-- E1・E2: 中部以外、E3: 中部（開始24時間以内なので優先される）
create function pg_temp.mk(p_name text, p_chubu boolean) returns uuid language plpgsql as $$
declare r record;
begin
  select * into r from public.create_entry_atomic('zz-t', 'pii-' || p_name, null, null, p_name, '学校' || p_name, '２年', 'msg', 'inq', p_chubu,
    md5('mail-' || p_name) || md5('mail2-' || p_name), md5('pw-' || p_name) || md5('pw2-' || p_name));
  return r.id;
end $$;
select pg_temp.mk('E1', false);
select pg_temp.mk('E2', false);
select pg_temp.mk('E3', true);
select pg_temp.chk('DB-01 受付番号は 1, 2, 3 と連番',
  (select string_agg(entry_number::text, ',' order by entry_number) from public.entries where project_id='zz-t') = '1,2,3',
  (select string_agg(entry_number::text, ',' order by entry_number) from public.entries where project_id='zz-t'));
select pg_temp.chk('DB-02 定員2。開始24時間以内は中部が優先され、中部以外の後ろのE2が押し出される（E1=登録済み, E2=キャンセル待ち, E3=登録済み）',
  (select string_agg(entry_name || ':' || status, ',' order by entry_number) from public.entries where project_id='zz-t') = 'E1:registered,E2:waitlist,E3:registered',
  (select string_agg(entry_name || ':' || status, ',' order by entry_number) from public.entries where project_id='zz-t'));
select pg_temp.chk('DB-01 同じメールの二重登録は断られる（キャンセル以外で一意）',
  pg_temp.err($$select public.create_entry_atomic('zz-t','p',null,null,'dup','a','b','m','i',false, md5('mail-E1') || md5('mail2-E1'), 'x')$$) <> 'OK');
update public.projects set entry_open = false where id = 'zz-t';
select pg_temp.chk('DB-01 受付停止中は登録できない', pg_temp.err($$select pg_temp.mk('Z1', false)$$) like '%Entry is closed%', pg_temp.err($$select pg_temp.mk('Z1', false)$$));
update public.projects set entry_open = true, period_start = now() + interval '1 day' where id = 'zz-t';
select pg_temp.chk('DB-01 開始前は登録できない', pg_temp.err($$select pg_temp.mk('Z2', false)$$) like '%has not started%');
update public.projects set period_start = now() - interval '2 days', period_end = now() - interval '1 day' where id = 'zz-t';
select pg_temp.chk('DB-01 終了後は登録できない', pg_temp.err($$select pg_temp.mk('Z3', false)$$) like '%has ended%');
update public.projects set period_start = now() - interval '1 hour', period_end = null where id = 'zz-t';
select pg_temp.chk('DB-01 登録に失敗しても、受付番号は進まない（失敗した登録で番号が飛ばない）',
  (select last_entry_number from public.projects where id='zz-t') = 3);

-- ===== DB-04 cancel_entry_by_id_atomic =====
create temp table cancel_result as
  select * from public.cancel_entry_by_id_atomic('zz-t', (select id from public.entries where project_id='zz-t' and entry_name='E1'));
select pg_temp.chk('DB-04 キャンセルすると、キャンセル待ちの先頭（E2）が繰り上がる。通知の状態は pending',
  (select promoted_entry_number from cancel_result) = 2
  and (select status from public.entries where project_id='zz-t' and entry_name='E2') = 'registered'
  and (select waitlist_promotion_notice from public.entries where project_id='zz-t' and entry_name='E2') = 'pending',
  (select row_to_json(c)::text from cancel_result c));
select pg_temp.chk('DB-04 キャンセルした人の状態は canceled',
  (select status from public.entries where project_id='zz-t' and entry_name='E1') = 'canceled');
update public.entries set checked_in = true where project_id='zz-t' and entry_name='E3';
select pg_temp.chk('DB-04 当日受付済みはキャンセルできない',
  pg_temp.err($$select public.cancel_entry_by_id_atomic('zz-t', (select id from public.entries where project_id='zz-t' and entry_name='E3'))$$) like '%Checked-in%',
  pg_temp.err($$select public.cancel_entry_by_id_atomic('zz-t', (select id from public.entries where project_id='zz-t' and entry_name='E3'))$$));
select pg_temp.chk('DB-04 別の大会の ID では、キャンセルできない',
  pg_temp.err($$select public.cancel_entry_by_id_atomic('zz-other', (select id from public.entries where project_id='zz-t' and entry_name='E2'))$$) <> 'OK');

-- ===== DB-03 設定の更新で再計算 =====
select pg_temp.mk('E4', false);   -- 定員2（E2, E3）が埋まっているので、キャンセル待ち
select pg_temp.chk('DB-03 定員いっぱいのとき、新しい人はキャンセル待ち',
  (select status from public.entries where project_id='zz-t' and entry_name='E4') = 'waitlist');
update public.projects set max_entries = 3 where id = 'zz-t';
select pg_temp.chk('DB-03 定員を増やすと、キャンセル待ちが繰り上がり、通知は pending',
  (select status from public.entries where project_id='zz-t' and entry_name='E4') = 'registered'
  and (select waitlist_promotion_notice from public.entries where project_id='zz-t' and entry_name='E4') = 'pending');
update public.projects set max_entries = 2 where id = 'zz-t';
select pg_temp.chk('DB-03 定員を減らしても、当日受付済みの人は登録済みのまま（それ以外が後ろから押し出される）',
  (select status from public.entries where project_id='zz-t' and entry_name='E3') = 'registered'
  and (select count(*) from public.entries where project_id='zz-t' and status in ('registered','late') ) = 2,
  (select string_agg(entry_name || ':' || status || ':' || checked_in::text, ',' order by entry_number) from public.entries where project_id='zz-t'));
update public.projects set max_entries = 5 where id = 'zz-t';

-- ===== DB-05 公開用の表（個人情報を含まない）=====
select pg_temp.chk('DB-05 public_entry_list の列に、個人情報・ハッシュが含まれない',
  not exists (select 1 from information_schema.columns where table_name='public_entry_list' and column_name ~* '(pii|hash|email|password|inquiry)'),
  (select string_agg(column_name, ',') from information_schema.columns where table_name='public_entry_list'));
select pg_temp.chk('DB-05 エントリーが公開用の表に同期される（キャンセルを含む）',
  (select count(*) from public.public_entry_list where project_id='zz-t') = (select count(*) from public.entries where project_id='zz-t'),
  (select count(*) from public.public_entry_list where project_id='zz-t')::text || ' / ' || (select count(*) from public.entries where project_id='zz-t')::text);
select pg_temp.chk('DB-05 公開用の設定に、鍵の保管・招待の情報がなく、公開鍵は同期される',
  exists (select 1 from public.public_project_settings where project_id='zz-t')
  and not exists (select 1 from information_schema.columns where table_name='public_project_settings' and column_name ~* '(private|hash|invite)'));

-- ===== DB-18 匿名のアクセス =====
select pg_temp.as_anon();
select pg_temp.chk('DB-18 匿名で、公開用の一覧は読める（許可した列）', pg_temp.err($$select entry_number, entry_name, status from public.public_entry_list where project_id='zz-t'$$) = 'OK');
select pg_temp.chk('DB-18 匿名で、公開用の一覧の entry_id は読めない', pg_temp.err($$select entry_id from public.public_entry_list limit 1$$) <> 'OK');
select pg_temp.chk('DB-18 匿名で、entries の暗号化列・ハッシュ列・メンバー・招待・鍵・監査ログは読めない',
  pg_temp.err($$select encrypted_pii from public.entries limit 1$$) <> 'OK'
  and pg_temp.err($$select email_hash_v2 from public.entries limit 1$$) <> 'OK'
  and pg_temp.err($$select disclosure_password_hash_v2 from public.entries limit 1$$) <> 'OK'
  and pg_temp.err($$select * from public.project_private_keys limit 1$$) <> 'OK'
  and pg_temp.err($$select token_hash from public.project_invites limit 1$$) <> 'OK'
  and pg_temp.err($$select * from public.audit_logs limit 1$$) <> 'OK'
  and (select count(*) from public.project_members) = 0);
select pg_temp.chk('DB-18 匿名で、entries に書けない・関数も呼べない',
  pg_temp.err($$update public.entries set status='registered'$$) <> 'OK'
  and pg_temp.err($$select public.set_score_vote('zz-t', 1, gen_random_uuid(), 'correct')$$) <> 'OK'
  and pg_temp.err($$select public.rate_limit_hit('x', 'y', 60, 5, null)$$) <> 'OK'
  and pg_temp.err($$select public.log_service_event('zz-t', 'x', null, 'staff', null, null, null, null)$$) <> 'OK');
reset role;

-- ===== DB-15 list_entries_for_admin =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select pg_temp.chk('DB-15 管理者は、キャンセル済み・キャンセル待ちを含め、全員を取得できる',
  (select count(*) from public.list_entries_for_admin('zz-t')) = 4
  and (select count(*) from public.list_entries_for_admin('zz-t') where status = 'canceled') = 1,
  (select count(*) from public.list_entries_for_admin('zz-t'))::text);
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select pg_temp.chk('DB-15 採点者は取得できない', pg_temp.err($$select * from public.list_entries_for_admin('zz-t')$$) <> 'OK');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000007');
select pg_temp.chk('DB-15 大会に関係のない人は取得できない', pg_temp.err($$select * from public.list_entries_for_admin('zz-t')$$) <> 'OK');
reset role;

-- ===================================================================
-- ここから採点・招待・リセット・権限
-- E2・E3 は当日受付済み、E4 は未受付。答案ページを 3 人分入れる。
-- ===================================================================
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-4000-8000-000000000008', 'y@example.invalid', 'authenticated', 'authenticated');
update public.entries set checked_in = true where project_id='zz-t' and entry_name in ('E2', 'E3');
insert into public.answer_pages (project_id, entry_id, storage_path, cells)
select 'zz-t', id, 'zz-t/' || entry_number || '/page.webp', '{"pageWidth": 800, "regions": {"q1": {"x":0}, "q2": {"x":0}, "q3": {"x":0}}}'::jsonb
from public.entries where project_id='zz-t' and status <> 'canceled';
insert into public.model_answers (project_id, question_number, answer, alt_answers) values ('zz-t', 1, '東京', array['とうきょう', 'Tokyo']);

create function pg_temp.eid(p_name text) returns uuid language sql as $$ select id from public.entries where project_id='zz-t' and entry_name = p_name $$;
-- メンバーの id は、採点者としてログインしていると他の人の行が見えない（RLS）ので、あらかじめ控えておく
create temp table mids as select display_name, id from public.project_members where project_id='zz-t';
grant select on mids to public;
create function pg_temp.mid(p_name text) returns uuid language sql as $$ select id from mids where display_name = p_name $$;

-- ===== DB-06 join_question_scorer =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1
select pg_temp.chk('DB-06 採点者は問題の枠に入れる', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$) = 'OK');
select pg_temp.chk('DB-06 すでに入っている人は、何度でも入れる（枠は増えない）', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$) = 'OK');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');  -- S2
select pg_temp.chk('DB-06 2人目も入れる（必要人数は2）', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$) = 'OK');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');  -- S3
select pg_temp.chk('DB-06 必要人数に達していると「満員」', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$) like '%full%', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$));
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');  -- 外された人
select pg_temp.chk('DB-06 外された人は入れない', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$) like '%Forbidden%');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000007');  -- 無関係な人
select pg_temp.chk('DB-06 大会のメンバーでない人は入れない', pg_temp.err($$select * from public.join_question_scorer('zz-t', 1)$$) like '%Forbidden%');
reset role;
select pg_temp.chk('DB-06 枠は2つだけ', (select count(*) from public.question_scorers where project_id='zz-t' and question_number=1) = 2);

-- ===== DB-07 set_score_vote =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1
select pg_temp.chk('DB-07 正解を付けられる', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E2'), 'correct')$$) = 'OK');
select pg_temp.chk('DB-07 保留・不正解も付けられる', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E3'), 'hold')$$) = 'OK');
select pg_temp.chk('DB-07 …判定は上書きできる（1人1票のまま）', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E3'), 'correct')$$) = 'OK');
select pg_temp.chk('DB-07 …票は増えない', (select count(*) from public.score_votes where project_id='zz-t' and question_number=1 and scorer_member_id = pg_temp.mid('S1')) = 2);
select pg_temp.chk('DB-07 正解・不正解・保留以外は付けられない', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E2'), 'maybe')$$) like '%Invalid%');
select pg_temp.chk('DB-07 当日受付を済ませていない人の答案には付けられない',
  pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E4'), 'correct')$$) like '%受付済みでない%',
  pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E4'), 'correct')$$));
select pg_temp.chk('DB-07 キャンセル済みの人の答案にも付けられない', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E1'), 'correct')$$) <> 'OK');
select pg_temp.chk('DB-07 別の大会のエントリーには付けられない', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, gen_random_uuid(), 'correct')$$) like '%Entry not found%');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');  -- S3
select pg_temp.chk('DB-07 枠が満員の問題では、判定を付けるだけでは入れない',
  pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E2'), 'correct')$$) like '%full%');
select pg_temp.chk('DB-07 枠が空いている問題なら、判定を付けた時点で自動で入る',
  pg_temp.err($$select * from public.set_score_vote('zz-t', 2, pg_temp.eid('E2'), 'correct')$$) = 'OK'
  );
reset role;
select pg_temp.chk('DB-07 …自動で入ったことが、枠に記録されている',
  exists (select 1 from public.question_scorers where project_id='zz-t' and question_number=2 and scorer_member_id = pg_temp.mid('S3')));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');  -- 外された人
select pg_temp.chk('DB-07 外された人は付けられない', pg_temp.err($$select * from public.set_score_vote('zz-t', 2, pg_temp.eid('E2'), 'correct')$$) like '%Forbidden%');
reset role;

-- ===== DB-09 list_question_answer_cards =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1
select pg_temp.chk('DB-09 採点画面の一覧は、当日受付を済ませた人だけ（E2・E3。E4・キャンセルは出ない）',
  (select string_agg(entry_number::text, ',' order by entry_number) from public.list_question_answer_cards('zz-t', 1)) = '2,3',
  (select string_agg(entry_number::text, ',' order by entry_number) from public.list_question_answer_cards('zz-t', 1)));
select pg_temp.chk('DB-09 …個人情報の列を含まない',
  pg_get_function_result('public.list_question_answer_cards(text,integer)'::regprocedure) !~* '(pii|hash|email)');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000007');  -- 無関係な人
select pg_temp.chk('DB-09 大会のメンバーでない人には、何も返らない', (select count(*) from public.list_question_answer_cards('zz-t', 1)) = 0);
reset role;

-- ===== DB-08 complete_question_scoring（2人とも完了で、確定する）=====
-- S1: E2=正解, E3=正解。S2: E2=正解, E3=不正解（E3 は意見が割れる）
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');  -- S2
select pg_temp.chk('S2 の判定を付ける', pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E2'), 'correct')$$) = 'OK'
  and pg_temp.err($$select * from public.set_score_vote('zz-t', 1, pg_temp.eid('E3'), 'wrong')$$) = 'OK');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1 が先に完了
create temp table c1 as select * from public.complete_question_scoring('zz-t', 1);
reset role;
select pg_temp.chk('DB-08 1人だけ完了しても、確定しない（必要人数は2）', (select finalized_count from c1) = 0 and (select count(*) from public.final_results where project_id='zz-t') = 0);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');  -- S2 が完了
create temp table c2 as select * from public.complete_question_scoring('zz-t', 1);
reset role;
select pg_temp.chk('DB-08 必要人数が完了すると、全員一致した答案だけが確定する（E2=正解。意見が割れた E3 は確定しない）',
  (select finalized_count from c2) = 1
  and (select result from public.final_results where project_id='zz-t' and question_number=1 and entry_id = pg_temp.eid('E2')) = 'correct'
  and not exists (select 1 from public.final_results where project_id='zz-t' and entry_id = pg_temp.eid('E3')),
  (select string_agg(question_number || ':' || result, ',') from public.final_results where project_id='zz-t'));
select pg_temp.chk('DB-08 当日受付していない人（E4）には確定を記録しない。あとで受付しても、確定は作られない',
  not exists (select 1 from public.final_results where project_id='zz-t' and entry_id = pg_temp.eid('E4')));
update public.entries set checked_in = true where id = pg_temp.eid('E4');
select pg_temp.chk('DB-08 …あとで受付しても、その問題の確定は作られない（採点後に受付した人は0点）',
  not exists (select 1 from public.final_results where project_id='zz-t' and entry_id = pg_temp.eid('E4')));
update public.entries set checked_in = false where id = pg_temp.eid('E4');
select pg_temp.chk('DB-08 確定は履歴（score_events）に残る', exists (select 1 from public.score_events where project_id='zz-t' and event_type='finalized'));

-- ===== DB-09 list_score_conflicts / DB-10 resolve_score_conflict =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1（管理者でない）
select pg_temp.chk('DB-09 要確認の一覧は、管理者でないと何も返らない', (select count(*) from public.list_score_conflicts('zz-t')) = 0);
select pg_temp.chk('DB-10 採点者は、最終判定を決められない', pg_temp.err($$select * from public.resolve_score_conflict('zz-t', 1, pg_temp.eid('E3'), 'correct')$$) like '%Forbidden%');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');  -- 管理者
select pg_temp.chk('DB-09 管理者は、要確認の答案を、票つきで取得できる（E3: 票が2、最終判定なし）',
  exists (select 1 from public.list_score_conflicts('zz-t') c where c.entry_id = pg_temp.eid('E3') and c.final_result is null and jsonb_array_length(c.votes) = 2),
  (select string_agg(entry_number::text || ':' || coalesce(final_result,'-'), ',') from public.list_score_conflicts('zz-t')));
select pg_temp.chk('DB-09 …当日受付していない人（E4）は含まれない', not exists (select 1 from public.list_score_conflicts('zz-t') c where c.entry_id = pg_temp.eid('E4')));
select pg_temp.chk('DB-09 …別解（模範解答の alt_answers）が返る',
  exists (select 1 from public.list_score_conflicts('zz-t') c where c.question_number = 1 and c.model_answer = '東京' and c.model_alt_answers @> array['Tokyo']));
select pg_temp.chk('DB-10 管理者は最終判定を決められる（不正解）', pg_temp.err($$select * from public.resolve_score_conflict('zz-t', 1, pg_temp.eid('E3'), 'wrong')$$) = 'OK');
select pg_temp.chk('DB-10 正解・不正解・保留以外は断る', pg_temp.err($$select * from public.resolve_score_conflict('zz-t', 1, pg_temp.eid('E3'), 'x')$$) like '%Invalid%');
select pg_temp.chk('DB-10 決めたあとで、もう一度変えられる（履歴は conflict_resolved → final_changed）',
  pg_temp.err($$select * from public.resolve_score_conflict('zz-t', 1, pg_temp.eid('E3'), 'hold')$$) = 'OK');
reset role;
select pg_temp.chk('DB-10 最終判定が保存され、決めた人が記録される',
  (select result from public.final_results where project_id='zz-t' and question_number=1 and entry_id = pg_temp.eid('E3')) = 'hold'
  and (select decided_by from public.final_results where project_id='zz-t' and question_number=1 and entry_id = pg_temp.eid('E3')) = pg_temp.mid('Admin'));
select pg_temp.chk('DB-10 履歴に 2 件（conflict_resolved は古い値なし、final_changed は古い値あり）',
  (select array_agg(event_type || ':' || coalesce(old_result, '-') || '>' || new_result order by event_type) from public.score_events where project_id='zz-t' and entry_id = pg_temp.eid('E3') and event_type in ('conflict_resolved','final_changed')) = array['conflict_resolved:->wrong', 'final_changed:wrong>hold'],
  (select array_agg(event_type || ':' || coalesce(old_result, '-') || '>' || new_result order by event_type)::text from public.score_events where project_id='zz-t' and entry_id = pg_temp.eid('E3') and event_type in ('conflict_resolved','final_changed')));

-- ===== DB-10a release_question_scorer =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');  -- S2 が、S3 の問題2の枠を解放する
select pg_temp.chk('DB-10a メンバーなら誰でも、他の人の未完了の枠を解放できる',
  pg_temp.err($$select * from public.release_question_scorer('zz-t', 2, pg_temp.mid('S3'))$$) = 'OK',
  pg_temp.err($$select * from public.release_question_scorer('zz-t', 2, pg_temp.mid('S3'))$$));
reset role;
select pg_temp.chk('DB-10a …その人のその問題の判定も消える。枠も消える',
  not exists (select 1 from public.score_votes where project_id='zz-t' and question_number=2 and scorer_member_id = pg_temp.mid('S3'))
  and not exists (select 1 from public.question_scorers where project_id='zz-t' and question_number=2 and scorer_member_id = pg_temp.mid('S3')));
select pg_temp.chk('DB-10a …監査ログに残る', exists (select 1 from public.audit_logs where project_id='zz-t' and action='question_slot.release'));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');  -- S3
select pg_temp.chk('DB-10a 完了した枠は解放できない', pg_temp.err($$select * from public.release_question_scorer('zz-t', 1, pg_temp.mid('S1'))$$) <> 'OK',
  pg_temp.err($$select * from public.release_question_scorer('zz-t', 1, pg_temp.mid('S1'))$$));
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000007');  -- 無関係な人
select pg_temp.chk('DB-10a 大会のメンバーでない人は解放できない', pg_temp.err($$select * from public.release_question_scorer('zz-t', 2, pg_temp.mid('S3'))$$) <> 'OK');
reset role;

-- ===== DB-13 招待 =====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');  -- 管理者
select pg_temp.chk('DB-13 採点者は招待を発行できない（サーバー経由のみ）。管理者も直接は呼べない', pg_temp.err($$select * from public.create_scorer_invite('zz-t', repeat('a', 64), 1, 'a0000000-0000-4000-8000-000000000002')$$) <> 'OK');
reset role;
create temp table inv as select * from public.create_scorer_invite('zz-t', repeat('a', 64), 1, 'a0000000-0000-4000-8000-000000000002');
select pg_temp.chk('DB-13 発行した招待は、ハッシュだけが保存され、上限1・採点者・7日', (select max_uses from public.project_invites where project_id='zz-t') = 1
  and (select token_hash from public.project_invites where project_id='zz-t') = repeat('a', 64)
  and (select expires_at - created_at from public.project_invites where project_id='zz-t') = interval '7 days');
select pg_temp.chk('DB-13 招待で参加できる', pg_temp.err($$select * from public.redeem_scorer_invite(repeat('a', 64), 'a0000000-0000-4000-8000-000000000007', 'X')$$) = 'OK');
select pg_temp.chk('DB-13 …採点者として入る', (select role from public.project_members where project_id='zz-t' and user_id='a0000000-0000-4000-8000-000000000007') = 'scorer');
select pg_temp.chk('DB-13 上限（1人）に達したら、次の人は参加できない', pg_temp.err($$select * from public.redeem_scorer_invite(repeat('a', 64), 'a0000000-0000-4000-8000-000000000008', 'Y')$$) like '%exhausted%');
select pg_temp.chk('DB-13 すでに参加している人は、使用回数を増やさずに通る',
  (select already_member from public.redeem_scorer_invite(repeat('a', 64), 'a0000000-0000-4000-8000-000000000007', 'X')) = true
  and (select use_count from public.project_invites where project_id='zz-t') = 1);
select pg_temp.chk('DB-13 外されたメンバーは、招待を使っても戻れない', pg_temp.err($$select * from public.redeem_scorer_invite(repeat('a', 64), 'a0000000-0000-4000-8000-000000000006', 'R')$$) like '%removed%');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1
select pg_temp.chk('DB-13 採点者は、招待を失効させられない', pg_temp.err($$select * from public.revoke_scorer_invite((select id from public.project_invites where project_id='zz-t'))$$) <> 'OK',
  pg_temp.err($$select * from public.revoke_scorer_invite((select id from public.project_invites where project_id='zz-t'))$$));
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
create temp table inv_id as select id from public.project_invites where project_id='zz-t';
grant select on inv_id to public;
select pg_temp.chk('DB-13 管理者は、招待を失効させられる', pg_temp.err($$select * from public.revoke_scorer_invite((select id from inv_id))$$) = 'OK', pg_temp.err($$select * from public.revoke_scorer_invite((select id from inv_id))$$));
reset role;
select pg_temp.chk('DB-13 失効した招待は使えない', pg_temp.err($$select * from public.redeem_scorer_invite(repeat('a', 64), 'a0000000-0000-4000-8000-000000000008', 'Y')$$) like '%revoked%');
select pg_temp.chk('DB-13 存在しないトークンは使えない', pg_temp.err($$select * from public.redeem_scorer_invite(repeat('b', 64), 'a0000000-0000-4000-8000-000000000008', 'Y')$$) like '%Invalid%');

-- ===== DB-16 / DB-17 サービス専用の関数 =====
select pg_temp.chk('DB-16 rate_limit_hit は排他制御つきで数え、直前までの件数を返す（0, 1, 2）',
  (select array_agg(public.rate_limit_hit('zz-bucket', 'zz-scope', 600, 10, 'zz-t')) from generate_series(1, 3)) = array[0, 1, 2],
  (select array_agg(public.rate_limit_hit('zz-bucket', 'zz-scope2', 600, 10, 'zz-t'))::text from generate_series(1, 3)));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');  -- 管理者でも
select pg_temp.chk('DB-16 ログイン済みの利用者は、rate_limit_hit を呼べない', pg_temp.err($$select public.rate_limit_hit('x', 'y', 60, 5, null)$$) <> 'OK');
select pg_temp.chk('DB-17 …log_service_event・log_audit_event も呼べない（偽の記録を作れない）',
  pg_temp.err($$select public.log_service_event('zz-t', 'forged', null, 'staff', null, null, null, null)$$) <> 'OK'
  and pg_temp.err($$select public.log_audit_event('zz-t', 'forged', null, null, null, null)$$) <> 'OK');
select pg_temp.chk('DB-17 …audit_logs に直接書けない', pg_temp.err($$insert into public.audit_logs(project_id, action) values ('zz-t', 'forged')$$) <> 'OK');
reset role;
select pg_temp.chk('DB-17 log_service_event（サービス側）は呼べる', pg_temp.err($$select public.log_service_event('zz-t', 'entry.checkin', null, 'staff', null, null, null, '{"checked_in":true}'::jsonb)$$) = 'OK');
select pg_temp.chk('DB-17 …監査ログに書かれる', exists (select 1 from public.audit_logs where project_id='zz-t' and action='entry.checkin'));

-- ===== DB-19 メンバーの権限（RLS）=====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- 採点者 S1
select pg_temp.chk('DB-19 採点者は、鍵の保管庫（権限なし）・監査ログ（0件）・招待のトークンハッシュを読めない',
  pg_temp.err($$select * from public.project_private_keys$$) <> 'OK'
  and (select count(*) from public.audit_logs) = 0
  and pg_temp.err($$select token_hash from public.project_invites limit 1$$) <> 'OK');
select pg_temp.chk('DB-19 採点者は、エントリーの暗号化列・ハッシュ列を読めない',
  pg_temp.err($$select encrypted_pii from public.entries limit 1$$) <> 'OK'
  and pg_temp.err($$select email_hash_v2 from public.entries limit 1$$) <> 'OK'
  and pg_temp.err($$select disclosure_password_hash_v2 from public.entries limit 1$$) <> 'OK');
select pg_temp.chk('DB-19 採点者は、管理系の表を書き換えられない（entries・projects・final_results・model_answers・project_members・answer_pages。0行か拒否）',
  pg_temp.affected($$update public.entries set checked_in = true where project_id='zz-t'$$) <= 0
  and pg_temp.affected($$update public.projects set name = 'hacked' where id='zz-t'$$) <= 0
  and pg_temp.affected($$update public.final_results set result = 'correct'$$) <= 0
  and pg_temp.affected($$update public.model_answers set answer = 'x'$$) <= 0
  and pg_temp.affected($$update public.project_members set role = 'owner' where project_id='zz-t'$$) <= 0
  and pg_temp.affected($$delete from public.answer_pages$$) <= 0);
select pg_temp.chk('DB-19 採点者は、他人の判定を書き換えられない（自分の判定だけ）',
  pg_temp.affected('update public.score_votes set result = ''wrong'' where scorer_member_id <> ''' || pg_temp.mid('S1') || '''') <= 0);
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');  -- 管理者
select pg_temp.chk('DB-19 管理者は、監査ログを読める', (select count(*) from public.audit_logs where project_id='zz-t') > 0);
select pg_temp.chk('DB-19 管理者でも、鍵の保管庫は直接読めない（サーバー経由のみ）', pg_temp.err($$select * from public.project_private_keys$$) <> 'OK' and pg_temp.err($$insert into public.project_private_keys(project_id, encrypted_private_key) values ('zz-t', 'x')$$) <> 'OK');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');  -- 外された人
select pg_temp.chk('DB-19 外された人は、大会も、メンバーも、判定も読めない',
  (select count(*) from public.projects where id='zz-t') = 0
  and (select count(*) from public.final_results where project_id='zz-t') = 0
  and (select count(*) from public.score_votes where project_id='zz-t') = 0
  and (select count(*) from public.list_question_answer_cards('zz-t', 1)) = 0);
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000008');  -- 大会と関係のない人（Y）
select pg_temp.chk('DB-19 関係のない人は、他の大会のデータを読めない',
  (select count(*) from public.projects where id='zz-t') = 0
  and (select count(*) from public.project_members where project_id='zz-t') = 0
  and (select count(*) from public.model_answers where project_id='zz-t') = 0);
reset role;

-- ===== DB-20 Realtime / DB-21 バケット / DB-24 補助の関数 =====
select pg_temp.chk('DB-20 Realtime の配信対象に public_entry_list がある（エントリーリストが使う）',
  exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='public_entry_list'),
  (select string_agg(tablename, ',') from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'));
select pg_temp.chk('DB-20 Realtime の配信対象に、個人情報の表（entries）が入っていない',
  not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('entries','project_private_keys','project_invites','audit_logs')));
select pg_temp.chk('DB-21 答案のバケットは、どちらも非公開',
  (select count(*) from storage.buckets where id in ('answer-pages','answer-cells') and public = false) = 2,
  (select string_agg(id || ':' || public::text, ',') from storage.buckets));
select pg_temp.chk('DB-21 バケットの読み取りはメンバーのみ、書き込みは管理者のみ（4つの方針）',
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('answer_cells_storage_select_member','answer_cells_storage_write_admin','answer_pages_storage_select_member','answer_pages_storage_write_admin')) = 4
  and not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and (qual ilike '%answer-%' or with_check ilike '%answer-%') and roles::text ~ 'anon'));
select pg_temp.chk('DB-24 旧関数（cancel_entry_atomic・join_project_with_scorer_code）は、もうない',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cancel_entry_atomic','join_project_with_scorer_code')));
select pg_temp.chk('DB-24 全部の表で RLS が有効（public スキーマ）',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  (select string_agg(c.relname, ',') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity));

-- ===== DB-14 reset_project_data（最後に実行）=====
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');  -- S1
select pg_temp.chk('DB-14 採点者はリセットできない', pg_temp.err($$select * from public.reset_project_data('zz-t')$$) like '%Forbidden%');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');  -- 管理者
select pg_temp.chk('DB-14 管理者はリセットできる', pg_temp.err($$select * from public.reset_project_data('zz-t')$$) = 'OK');
reset role;
select pg_temp.chk('DB-14 エントリー・答案・模範解答・採点（枠・判定・確定・履歴）が消え、受付番号が 0 に戻る。メンバーと設定は残る',
  (select count(*) from public.entries where project_id='zz-t') = 0
  and (select count(*) from public.answer_pages where project_id='zz-t') = 0
  and (select count(*) from public.model_answers where project_id='zz-t') = 0
  and (select count(*) from public.question_scorers where project_id='zz-t') = 0
  and (select count(*) from public.score_votes where project_id='zz-t') = 0
  and (select count(*) from public.final_results where project_id='zz-t') = 0
  and (select count(*) from public.score_events where project_id='zz-t') = 0
  and (select last_entry_number from public.projects where id='zz-t') = 0
  and (select count(*) from public.project_members where project_id='zz-t') >= 5
  and (select max_entries from public.projects where id='zz-t') = 5,
  (select count(*) from public.entries where project_id='zz-t')::text);
select pg_temp.chk('DB-14 公開用の一覧も空になる', (select count(*) from public.public_entry_list where project_id='zz-t') = 0);
select pg_temp.chk('DB-14 監査ログに project_data_reset が残る', exists (select 1 from public.audit_logs where project_id='zz-t' and action='project_data_reset'));

select name, ok, detail from tr;
rollback;

