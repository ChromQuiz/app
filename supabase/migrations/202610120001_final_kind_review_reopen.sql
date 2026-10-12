-- 確定のあとでも、管理者が直せるようにする。
--
-- 背景: 採点者が完了すると、全員一致の答案は、自動で確定する。
--   * 間違いに気づいても、確定のあとは、要確認に出る答案（判定が割れた答案）しか、管理者は直せなかった。
--   * 管理者が決めた結果と、自動の結果が、同じ記録で、あとから見分けがつかなかった。
--   * 完了した枠は、解放できず、やり直す手段がなかった。
--
-- この変更:
--   1. final_results に decided_kind（auto = 全員一致で自動 / admin = 管理者が決めた）を足す。
--      すでにある記録は、score_events に「管理者が決めた」記録のあるものを admin、それ以外を auto にする。
--   2. resolve_score_conflict は、管理者が決めたときに、decided_kind = 'admin' で保存する。
--   3. list_question_review: 1つの問題の、受付済みの全員の答案・判定・確定を返す（管理者だけ）。
--      要確認ページで「問題を選んで」見直し、確定のあとの答案も直せるようにするため。
--   4. reopen_question_scoring: 完了した枠を開き直す（管理者だけ）。
--      判定は消さない（採点者が、自分の判定を直せる）。自動で確定した記録は消す（直した判定で、また完了したときに、
--      つけ直す）。管理者が決めた記録は残す。誰が・どの問題を・何件の自動確定を消して開き直したかを audit_logs に残す。

alter table public.final_results
  add column if not exists decided_kind text not null default 'auto'
  check (decided_kind in ('auto', 'admin'));

update public.final_results fr
set decided_kind = 'admin'
where exists (
  select 1
  from public.score_events se
  where se.project_id = fr.project_id
    and se.question_number = fr.question_number
    and se.entry_id = fr.entry_id
    and se.event_type in ('conflict_resolved', 'final_changed')
);

create or replace function public.resolve_score_conflict(
  p_project_id text,
  p_question_number integer,
  p_entry_id uuid,
  p_result text
)
returns table(project_id text, question_number integer, entry_id uuid, result text, decided_by uuid, decided_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_old_result text;
  v_row public.final_results%rowtype;
begin
  if p_result not in ('correct', 'wrong', 'hold') then
    raise exception 'Invalid result';
  end if;

  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.entries e
    where e.id = p_entry_id
      and e.project_id = p_project_id
  ) then
    raise exception 'Entry not found';
  end if;

  select fr.result into v_old_result
  from public.final_results fr
  where fr.project_id = p_project_id
    and fr.question_number = p_question_number
    and fr.entry_id = p_entry_id;

  insert into public.final_results(project_id, question_number, entry_id, result, decided_by, decided_at, decided_kind)
  values (p_project_id, p_question_number, p_entry_id, p_result, v_member_id, now(), 'admin')
  on conflict on constraint final_results_pkey do update
    set result = excluded.result,
        decided_by = excluded.decided_by,
        decided_at = excluded.decided_at,
        decided_kind = 'admin'
  returning * into v_row;

  insert into public.score_events(
    project_id,
    question_number,
    entry_id,
    actor_member_id,
    event_type,
    old_result,
    new_result
  )
  values (
    p_project_id,
    p_question_number,
    p_entry_id,
    v_member_id,
    case when v_old_result is null then 'conflict_resolved' else 'final_changed' end,
    v_old_result,
    p_result
  );

  return query
  select r.project_id, r.question_number, r.entry_id, r.result, r.decided_by, r.decided_at
  from (select v_row.*) as r;
end;
$$;

revoke all on function public.resolve_score_conflict(text, integer, uuid, text) from public, anon;
grant execute on function public.resolve_score_conflict(text, integer, uuid, text) to authenticated;

-- 1つの問題の、受付済みで答案のある全員。判定が割れていなくても、確定済みでも返す。
create or replace function public.list_question_review(
  p_project_id text,
  p_question_number integer
)
returns table (
  question_number integer,
  entry_id uuid,
  entry_number integer,
  affiliation text,
  grade text,
  storage_path text,
  page_width numeric,
  cell_region jsonb,
  cell_status text,
  cell_path text,
  cell_generation_version text,
  model_answer text,
  model_alt_answers text[],
  final_result text,
  decided_kind text,
  votes jsonb
)
language sql
stable
set search_path = public
as $$
  select
    p_question_number as question_number,
    ap.entry_id,
    e.entry_number,
    e.affiliation,
    e.grade,
    ap.storage_path,
    nullif(ap.cells->>'pageWidth', '')::numeric as page_width,
    ap.cells->'regions'->('q' || p_question_number::text) as cell_region,
    case
      when ap.cells #>> array['cellGeneration', 'version'] = 'answer-cell-v1'
       and ap.cells #>> array['cellGeneration', 'questions', 'q' || p_question_number::text] = 'ready'
        then 'ready'
      else null
    end as cell_status,
    case
      when ap.cells #>> array['cellGeneration', 'version'] = 'answer-cell-v1'
       and ap.cells #>> array['cellGeneration', 'questions', 'q' || p_question_number::text] = 'ready'
        then p_project_id || '/' || e.entry_number::text || '/q' || p_question_number::text || '.webp'
      else null
    end as cell_path,
    ap.cells #>> array['cellGeneration', 'version'] as cell_generation_version,
    ma.answer as model_answer,
    coalesce(ma.alt_answers, '{}') as model_alt_answers,
    fr.result as final_result,
    fr.decided_kind,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('scorer_member_id', sv.scorer_member_id, 'result', sv.result)
          order by sv.scorer_member_id
        )
        from public.score_votes sv
        where sv.project_id = p_project_id
          and sv.question_number = p_question_number
          and sv.entry_id = ap.entry_id
      ),
      '[]'::jsonb
    ) as votes
  from public.answer_pages ap
  join public.entries e
    on e.id = ap.entry_id
   and e.project_id = p_project_id
   and e.checked_in = true
  left join public.model_answers ma
    on ma.project_id = p_project_id
   and ma.question_number = p_question_number
  left join public.final_results fr
    on fr.project_id = p_project_id
   and fr.question_number = p_question_number
   and fr.entry_id = ap.entry_id
  where ap.project_id = p_project_id
    and public.has_project_role(p_project_id, array['owner', 'admin'])
  order by e.entry_number asc;
$$;

revoke all on function public.list_question_review(text, integer) from public, anon;
grant execute on function public.list_question_review(text, integer) to authenticated;

-- 完了した枠を開き直す。p_scorer_member_id が null なら、その問題の完了した枠すべて。
create or replace function public.reopen_question_scoring(
  p_project_id text,
  p_question_number integer,
  p_scorer_member_id uuid default null
)
returns table(reopened_slots integer, cleared_auto_finals integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_member_id(p_project_id);
  v_slots integer := 0;
  v_cleared integer := 0;
begin
  if v_actor is null or not public.has_project_role(p_project_id, array['owner', 'admin']) then
    raise exception 'この操作を行う権限がありません。';
  end if;

  update public.question_scorers qs
    set completed_at = null
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.completed_at is not null
      and (p_scorer_member_id is null or qs.scorer_member_id = p_scorer_member_id);
  get diagnostics v_slots = row_count;

  if v_slots = 0 then
    raise exception '開き直せる枠が見つかりません。完了した枠がないか、画面が古い可能性があります。';
  end if;

  -- 自動で確定した記録は、判定の根拠が変わるので消す。完了し直したときに、つけ直される。
  delete from public.final_results fr
    where fr.project_id = p_project_id
      and fr.question_number = p_question_number
      and fr.decided_kind = 'auto';
  get diagnostics v_cleared = row_count;

  insert into public.audit_logs(project_id, actor_user_id, actor_member_id, action, target_table, target_id, before_data, after_data)
  values (
    p_project_id,
    auth.uid(),
    v_actor,
    'question_scoring.reopen',
    'question_scorers',
    p_question_number::text || ':' || coalesce(p_scorer_member_id::text, 'all'),
    jsonb_build_object('question_number', p_question_number, 'scorer_member_id', p_scorer_member_id, 'reopened_slots', v_slots, 'cleared_auto_finals', v_cleared),
    null
  );

  return query select v_slots, v_cleared;
end;
$$;

revoke all on function public.reopen_question_scoring(text, integer, uuid) from public, anon;
grant execute on function public.reopen_question_scoring(text, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
