-- 解答欄の画像づくりの待ち行列を、1つにまとめる。
--
-- サーバーの定期実行も、複数の管理者の画面も、同じ DB の待ち行列から、用紙を取る。
--   1. 全体の上限: 「作成中」の用紙が、上限(既定 48枚)に達したら、取らせない。管理者が何人いても、同時に動く数は、ここで止まる。
--      取る処理を、1つずつ順番に行う(advisory lock)ので、上限を超えない。
--   2. 失敗の扱い: 用紙そのものが読めない(status = failed)ときだけ 30分休む。保存の一時的な失敗(status = partial)は、
--      1分休んで、取り直す。
--   3. 進み具合: answer_cell_progress。画面(管理者)とサーバー(service_role)が、「完了」と「混んでいる」を区別し、
--      「解答欄の画像 8,420 / 11,700 枚」を出すため。
--   4. mark_answer_cell_missing: 画像が見つからない問題を、「作り直す」に戻す(管理者のみ。1回の更新で、記録を書き換える)。
--      ブラウザが、記録を読んで書き戻して、サーバーの途中経過を上書きするのを、やめるため。

drop function if exists public.claim_answer_cell_pages(text, integer);

create or replace function public.claim_answer_cell_pages(
  p_project_id text default null,
  p_limit integer default 2,
  p_max_in_flight integer default 48
)
returns table (
  id uuid,
  project_id text,
  entry_id uuid,
  entry_number integer,
  storage_path text,
  cells jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_flight integer;
  v_room integer;
begin
  -- 取る処理を、1つずつにする(同時に取って、上限を超えないように)
  perform pg_advisory_xact_lock(hashtext('ciq.claim_answer_cell_pages'));

  select count(*) into v_in_flight
  from public.answer_pages a
  where a.cells->'cellGeneration'->>'status' = 'processing'
    and nullif(a.cells->'cellGeneration'->>'startedAt', '')::timestamptz > now() - interval '1 minute';

  v_room := greatest(0, coalesce(p_max_in_flight, 48) - v_in_flight);
  if v_room <= 0 then
    return;
  end if;

  return query
  with picked as (
    select a.id
    from public.answer_pages a
    where (p_project_id is null or a.project_id = p_project_id)
      and coalesce(a.cells->'cellGeneration'->>'status', 'not_started') <> 'complete'
      -- 状態がまだ無い用紙(null)も、取れる。比較が null になっても、休みの対象にはしない(coalesce)
      and not coalesce(
        a.cells->'cellGeneration'->>'status' = 'processing'
        and nullif(a.cells->'cellGeneration'->>'startedAt', '')::timestamptz > now() - interval '1 minute',
        false
      )
      -- 用紙が読めなかった: 30分休む
      and not coalesce(
        a.cells->'cellGeneration'->>'status' = 'failed'
        and nullif(a.cells->'cellGeneration'->>'failedAt', '')::timestamptz > now() - interval '30 minutes',
        false
      )
      -- 保存の一時的な失敗(一部できている): 1分休む
      and not coalesce(
        a.cells->'cellGeneration'->>'status' = 'partial'
        and nullif(a.cells->'cellGeneration'->>'failedAt', '')::timestamptz > now() - interval '1 minute',
        false
      )
    order by (
      select count(*) from jsonb_each_text(coalesce(a.cells->'cellGeneration'->'questions', '{}'::jsonb)) q
      where q.value = 'ready'
    ), a.uploaded_at, a.id
    limit greatest(1, least(coalesce(p_limit, 2), 10, v_room))
    for update skip locked
  ),
  claimed as (
    update public.answer_pages a
    set cells = jsonb_set(
      a.cells,
      '{cellGeneration}',
      coalesce(a.cells->'cellGeneration', '{}'::jsonb)
        || jsonb_build_object('status', 'processing', 'startedAt', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    )
    from picked
    where a.id = picked.id
    returning a.id, a.project_id, a.entry_id, a.storage_path, a.cells
  )
  select c.id, c.project_id, c.entry_id, e.entry_number, c.storage_path, c.cells
  from claimed c
  join public.entries e on e.id = c.entry_id;
end;
$$;

revoke all on function public.claim_answer_cell_pages(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_answer_cell_pages(text, integer, integer) to service_role;

-- 進み具合。管理者(その大会の owner / admin)と、サーバー(service_role)だけ。
create or replace function public.answer_cell_progress(p_project_id text default null)
returns table (
  total_pages integer,
  complete_pages integer,
  total_cells integer,
  ready_cells integer,
  pending_pages integer,
  in_flight_pages integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role'
     and not (p_project_id is not null and public.has_project_role(p_project_id, array['owner', 'admin'])) then
    return;
  end if;

  return query
  with pages as (
    select
      a.cells->'cellGeneration'->>'status' as status,
      nullif(a.cells->'cellGeneration'->>'startedAt', '')::timestamptz as started_at,
      nullif(a.cells->'cellGeneration'->>'failedAt', '')::timestamptz as failed_at,
      (select count(*) from jsonb_each(coalesce(a.cells->'regions', '{}'::jsonb)) r where r.value <> 'null'::jsonb) as cells_total,
      case when a.cells->'cellGeneration'->>'version' = 'answer-cell-v1' then
        (select count(*) from jsonb_each_text(coalesce(a.cells->'cellGeneration'->'questions', '{}'::jsonb)) q where q.value = 'ready')
      else 0 end as cells_ready
    from public.answer_pages a
    where p_project_id is null or a.project_id = p_project_id
  )
  select
    count(*)::integer,
    (count(*) filter (where coalesce(status, 'not_started') = 'complete'))::integer,
    coalesce(sum(cells_total), 0)::integer,
    coalesce(sum(cells_ready), 0)::integer,
    (count(*) filter (where coalesce(status, 'not_started') <> 'complete'
       and not coalesce(status = 'processing' and started_at > now() - interval '1 minute', false)
       and not coalesce(status = 'failed' and failed_at > now() - interval '30 minutes', false)
       and not coalesce(status = 'partial' and failed_at > now() - interval '1 minute', false)))::integer,
    (count(*) filter (where coalesce(status = 'processing' and started_at > now() - interval '1 minute', false)))::integer
  from pages;
end;
$$;

revoke all on function public.answer_cell_progress(text) from public, anon;
grant execute on function public.answer_cell_progress(text) to authenticated, service_role;

-- 画像が見つからない問題を、「作り直す」に戻す。
create or replace function public.mark_answer_cell_missing(p_project_id text, p_entry_id uuid, p_question_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_project_role(p_project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;
  if p_question_number is null or p_question_number < 1 then
    raise exception 'Invalid question';
  end if;

  update public.answer_pages a
  set cells = jsonb_set(
    a.cells,
    '{cellGeneration}',
    coalesce(a.cells->'cellGeneration', '{}'::jsonb)
      || jsonb_build_object(
        'status', 'partial',
        'failedAt', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        'questions', coalesce(a.cells->'cellGeneration'->'questions', '{}'::jsonb)
          || jsonb_build_object('q' || p_question_number::text, 'failed')
      )
  )
  where a.project_id = p_project_id
    and a.entry_id = p_entry_id;
end;
$$;

revoke all on function public.mark_answer_cell_missing(text, uuid, integer) from public, anon;
grant execute on function public.mark_answer_cell_missing(text, uuid, integer) to authenticated;

notify pgrst, 'reload schema';
