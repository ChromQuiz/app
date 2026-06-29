-- Avoid PL/pgSQL name ambiguity between RETURN TABLE columns and score_votes columns.

create or replace function public.set_score_vote(
  p_project_id text,
  p_question_number integer,
  p_entry_id uuid,
  p_result text
)
returns table(id uuid, project_id text, question_number integer, entry_id uuid, scorer_member_id uuid, result text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_vote public.score_votes%rowtype;
begin
  if p_result not in ('correct', 'wrong', 'hold') then
    raise exception 'Invalid result';
  end if;
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'Forbidden';
  end if;
  if not exists (
    select 1 from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = v_member_id
  ) then
    perform public.join_question_scorer(p_project_id, p_question_number);
  end if;
  if not exists (
    select 1 from public.entries e
    where e.id = p_entry_id
      and e.project_id = p_project_id
  ) then
    raise exception 'Entry not found';
  end if;

  insert into public.score_votes(project_id, question_number, entry_id, scorer_member_id, result)
  values (p_project_id, p_question_number, p_entry_id, v_member_id, p_result)
  on conflict (project_id, question_number, entry_id, scorer_member_id) do update
    set result = excluded.result,
        updated_at = now()
  returning * into v_vote;

  insert into public.score_events(project_id, question_number, entry_id, actor_member_id, event_type, new_result)
  values (p_project_id, p_question_number, p_entry_id, v_member_id, 'vote_changed', p_result);

  return query select v_vote.id, v_vote.project_id, v_vote.question_number, v_vote.entry_id, v_vote.scorer_member_id, v_vote.result;
end;
$$;

revoke all on function public.set_score_vote(text, integer, uuid, text) from public, anon;
grant execute on function public.set_score_vote(text, integer, uuid, text) to authenticated;
