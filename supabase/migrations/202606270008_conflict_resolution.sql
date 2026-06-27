-- Admin conflict resolution RPC.

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

  insert into public.final_results(project_id, question_number, entry_id, result, decided_by, decided_at)
  values (p_project_id, p_question_number, p_entry_id, p_result, v_member_id, now())
  on conflict (project_id, question_number, entry_id) do update
    set result = excluded.result,
        decided_by = excluded.decided_by,
        decided_at = excluded.decided_at
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

  return query select v_row.project_id, v_row.question_number, v_row.entry_id, v_row.result, v_row.decided_by, v_row.decided_at;
end;
$$;

revoke all on function public.resolve_score_conflict(text, integer, uuid, text) from public, anon;
grant execute on function public.resolve_score_conflict(text, integer, uuid, text) to authenticated;
