-- 採点を完了した問題の判定を、あとから変えられないようにする。
-- 完了後に判定を変えると、確定(final_results)が追従しなかった(2026-10-09 に本番のデータベースで再現):
--   ・判定が割れていた答案が全員一致になっても、確定が作られず、要確認にも出ない → 正解なのに0点
--   ・確定済みの答案の票が割れても、確定が古いまま残る
-- 直し方は、完了後の変更を断ること。間違いは、管理者が resolve_score_conflict で決める。

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
  -- 採点を完了した人は、その問題の判定を変えられない。
  -- 完了のあとで変えると、確定(final_results)が追従せず、正解なのに確定が作られない・古い確定が残る、が起きる。
  -- 間違いに気づいたときは、管理者が「要確認」(resolve_score_conflict)で最終判定を決める。
  if exists (
    select 1 from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = v_member_id
      and qs.completed_at is not null
  ) then
    raise exception '採点を完了した問題の判定は変更できません。間違いに気づいたときは、管理者に「要確認」で最終判定を決めてもらってください。';
  end if;
  -- 採点の対象は、当日受付を済ませた人だけ(受付を取り消された人の答案には新しい判定を付けない)
  if not exists (
    select 1 from public.entries e
    where e.id = p_entry_id
      and e.project_id = p_project_id
      and e.checked_in = true
  ) then
    raise exception '受付済みでない参加者の答案は採点できません。';
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

notify pgrst, 'reload schema';
