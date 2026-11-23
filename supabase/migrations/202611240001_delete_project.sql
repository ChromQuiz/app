-- 大会の削除(取り消せない)。
--
-- 呼べるのは service_role だけ(Edge Function delete-project が、呼び出した人を
-- その大会の有効な所有者・管理者と確かめ、Storage のファイルを消してから呼ぶ)。
-- ブラウザ(authenticated / anon)から直接は呼べない。
--
-- projects の行を消すと、子の表(project_members, entries, answer_pages, model_answers,
-- score_votes, score_events, final_results, question_scorers, public_project_settings,
-- public_entry_list, project_private_keys, project_invites, email_events, participant_auth_events,
-- rate_limit_events, audit_logs)は、すべて on delete cascade で一緒に消える。
-- Google アカウント(auth.users)は消さない。共通の画像(site-card)にも触れない。
--
-- 監査: audit_logs はこの大会の行ごと消えるため、大会に紐づけない行(project_id = null)で
-- 「誰が、どの大会 ID を消したか」だけを残す。氏名・メール・大会名は入れない。

create or replace function public.delete_project_data(p_project_id text, p_actor_user_id uuid)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_project_id is null or p_actor_user_id is null then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_actor_user_id
      and pm.status = 'active'
      and pm.role = any(array['owner', 'admin'])
  ) then
    raise exception 'Forbidden';
  end if;

  delete from public.projects where id = p_project_id;
  if not found then
    raise exception 'Project not found';
  end if;

  insert into public.audit_logs(project_id, actor_user_id, actor_kind, action, target_table, target_id)
  values (null, p_actor_user_id, 'staff', 'project_deleted', 'projects', p_project_id);

  return query select true;
end;
$$;

revoke all on function public.delete_project_data(text, uuid) from public, anon, authenticated;
grant execute on function public.delete_project_data(text, uuid) to service_role;
