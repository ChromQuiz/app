-- 採点の枠を解放する。
--
-- 問題に入った採点者は、その問題の採点者の枠を1つ使う(必要人数 required_scorers まで)。
-- 途中でやめた人がいても、枠は占有されたままで、他の人が入れず、確定も進まなかった。
--
-- メンバー(所有者・管理者・採点者のいずれも運営のスタッフなので、役割は問わない)なら誰でも、
-- 「まだ完了していない枠」を解放できる。自分の枠も、他の人の枠も。
--   * 解放すると、その人のその問題での判定(score_votes)は消える。残すと、新しく入った人の判定と混ざり、
--     必要人数の一致の数え方がずれるため。
--   * 完了した枠は解放できない(完了した判定は、確定の根拠になっている)。
--   * 誰が、どの問題の、誰の枠を、判定を何件消して解放したかを audit_logs に残す。

create or replace function public.release_question_scorer(
  p_project_id text,
  p_question_number integer,
  p_scorer_member_id uuid
)
returns table(released boolean, deleted_votes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_member_id(p_project_id);
  v_row public.question_scorers%rowtype;
  v_deleted integer := 0;
begin
  if v_actor is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'この操作を行う権限がありません。';
  end if;

  select qs.* into v_row
    from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = p_scorer_member_id
    for update;
  if not found then
    raise exception '解放できる枠が見つかりません。すでに解放されているか、画面が古い可能性があります。';
  end if;
  if v_row.completed_at is not null then
    raise exception '採点を完了した枠は解放できません。';
  end if;

  delete from public.score_votes sv
    where sv.project_id = p_project_id
      and sv.question_number = p_question_number
      and sv.scorer_member_id = p_scorer_member_id;
  get diagnostics v_deleted = row_count;

  delete from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = p_scorer_member_id;

  insert into public.audit_logs(project_id, actor_user_id, actor_member_id, action, target_table, target_id, before_data, after_data)
  values (
    p_project_id,
    auth.uid(),
    v_actor,
    'question_slot.release',
    'question_scorers',
    p_question_number::text || ':' || p_scorer_member_id::text,
    jsonb_build_object('question_number', p_question_number, 'scorer_member_id', p_scorer_member_id, 'deleted_votes', v_deleted),
    null
  );

  return query select true, v_deleted;
end;
$$;

revoke all on function public.release_question_scorer(text, integer, uuid) from public, anon;
grant execute on function public.release_question_scorer(text, integer, uuid) to authenticated;
