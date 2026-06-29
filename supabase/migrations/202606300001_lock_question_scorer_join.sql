-- Serialize scorer joins per project/question so simultaneous third-seat clicks cannot overfill.

create or replace function public.join_question_scorer(
  p_project_id text,
  p_question_number integer
)
returns table(project_id text, question_number integer, scorer_member_id uuid, completed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_required integer;
  v_joined_count integer;
  v_row public.question_scorers%rowtype;
begin
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'Forbidden';
  end if;

  select required_scorers into v_required
  from public.projects
  where id = p_project_id;
  if not found then
    raise exception 'Project not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_project_id), p_question_number);

  select *
    into v_row
    from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = v_member_id;
  if found then
    return query select v_row.project_id, v_row.question_number, v_row.scorer_member_id, v_row.completed_at;
    return;
  end if;

  select count(*)
    into v_joined_count
    from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number;

  if v_joined_count >= v_required then
    raise exception 'Question is full';
  end if;

  insert into public.question_scorers(project_id, question_number, scorer_member_id)
  values (p_project_id, p_question_number, v_member_id)
  returning * into v_row;

  return query select v_row.project_id, v_row.question_number, v_row.scorer_member_id, v_row.completed_at;
end;
$$;

revoke all on function public.join_question_scorer(text, integer) from public, anon;
grant execute on function public.join_question_scorer(text, integer) to authenticated;
