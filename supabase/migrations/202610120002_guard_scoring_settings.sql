-- 答案の読み込み・採点が始まったあとに、設定を変えて周辺のデータと食い違わせない。
--
--   1. 問題数(question_count)は、答案が1件でも読み込まれていたら変えられない。
--      読み取り済みの解答欄の位置は、問題数に合わせて作ってあるため、食い違うと採点を進められなくなる。
--   2. 問題あたりの採点者数(required_scorers)は、採点の枠が1つでもできたら変えられない。
--      確定・要確認の判定が、この数で決まるため、途中で変えると完了済みの問題の扱いが変わる。
--   3. 変えたいときは、危険な操作「答案と採点を消す」(clear_answers_and_scoring)で、
--      答案・採点の枠・判定・確定・履歴を消してから(エントリーと模範解答は残る)、設定を変える。

create or replace function public.guard_scoring_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.question_count is distinct from old.question_count
     and exists (select 1 from public.answer_pages ap where ap.project_id = old.id) then
    raise exception '答案が読み込まれているため、問題数は変えられません。先に「答案と採点を消す」を実行してください。'
      using errcode = 'P0001';
  end if;
  if new.required_scorers is distinct from old.required_scorers
     and exists (select 1 from public.question_scorers qs where qs.project_id = old.id) then
    raise exception '採点が始まっているため、問題あたりの採点者数は変えられません。先に「答案と採点を消す」を実行してください。'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_scoring_settings on public.projects;
create trigger projects_guard_scoring_settings
  before update of question_count, required_scorers on public.projects
  for each row execute function public.guard_scoring_settings();

create or replace function public.clear_answers_and_scoring(p_project_id text)
returns table(answer_pages_deleted integer, votes_deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_pages integer;
  v_votes integer;
begin
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;

  select count(*) into v_votes from public.score_votes where project_id = p_project_id;
  delete from public.score_events where project_id = p_project_id;
  delete from public.final_results where project_id = p_project_id;
  delete from public.score_votes where project_id = p_project_id;
  delete from public.question_scorers where project_id = p_project_id;
  delete from public.answer_pages where project_id = p_project_id;
  get diagnostics v_pages = row_count;

  insert into public.audit_logs(project_id, actor_user_id, actor_member_id, action, target_table, target_id)
  values (p_project_id, auth.uid(), v_member_id, 'answers_and_scoring_cleared', 'projects', p_project_id);

  return query select v_pages, v_votes;
end;
$$;
revoke all on function public.clear_answers_and_scoring(text) from public, anon;
grant execute on function public.clear_answers_and_scoring(text) to authenticated;
