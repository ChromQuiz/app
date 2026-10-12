-- 覆した答案を、採点者の判定どおりの結果に戻したときは、「管理者が決めた」扱いをやめて、
-- 自動の結果(decided_kind = 'auto')に戻す。「管理者が覆したもの」の一覧に、元に戻した答案を残さない。
-- 判定が割れていた答案は、これまでどおり、管理者が決めたもの('admin')。

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
  v_required integer;
  v_corrects integer;
  v_wrongs integer;
  v_kind text;
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

  -- 採点者の判定が一致していて、その結果に決めたなら、自動の結果と同じ(覆していない)。
  -- 覆したあとに元へ戻した答案を、「管理者が覆したもの」に残さないため。
  select p.required_scorers into v_required from public.projects p where p.id = p_project_id;
  select count(*) filter (where sv.result = 'correct'), count(*) filter (where sv.result = 'wrong')
    into v_corrects, v_wrongs
  from public.score_votes sv
  where sv.project_id = p_project_id
    and sv.question_number = p_question_number
    and sv.entry_id = p_entry_id;
  v_kind := case
    when p_result = 'correct' and v_corrects >= v_required then 'auto'
    when p_result = 'wrong' and v_wrongs >= v_required then 'auto'
    else 'admin'
  end;

  insert into public.final_results(project_id, question_number, entry_id, result, decided_by, decided_at, decided_kind)
  values (p_project_id, p_question_number, p_entry_id, p_result, v_member_id, now(), v_kind)
  on conflict on constraint final_results_pkey do update
    set result = excluded.result,
        decided_by = excluded.decided_by,
        decided_at = excluded.decided_at,
        decided_kind = excluded.decided_kind
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
