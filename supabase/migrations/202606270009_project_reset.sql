-- Admin project data reset.

create or replace function public.reset_project_data(p_project_id text)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
begin
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;

  delete from public.score_events where project_id = p_project_id;
  delete from public.final_results where project_id = p_project_id;
  delete from public.score_votes where project_id = p_project_id;
  delete from public.question_scorers where project_id = p_project_id;
  delete from public.answer_pages where project_id = p_project_id;
  delete from public.model_answers where project_id = p_project_id;
  delete from public.entries where project_id = p_project_id;

  update public.projects
    set last_entry_number = 0
    where id = p_project_id;

  insert into public.audit_logs(project_id, actor_user_id, actor_member_id, action, target_table, target_id)
  values (p_project_id, auth.uid(), v_member_id, 'project_data_reset', 'projects', p_project_id);

  return query select true;
end;
$$;

revoke all on function public.reset_project_data(text) from public, anon;
grant execute on function public.reset_project_data(text) to authenticated;
