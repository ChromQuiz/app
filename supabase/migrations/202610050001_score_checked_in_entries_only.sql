-- 採点の対象を「当日受付を済ませた人」だけにする。
--
-- これまで:
--   * 採点画面・要確認ページには、答案が保存されている全員(キャンセル済み・キャンセル待ちを含む)が出ていた。
--   * 確定(complete_question_scoring)の対象は「登録済み・遅刻連絡済み」だった。
--   → 採点しても数えられない答案が混ざり、要確認の整理もややこしくなる。
--
-- これから:
--   受付した人(entries.checked_in = true)だけを、採点画面・要確認ページ・確定の対象にする。
--   * 遅刻の連絡をしただけで、まだ来ていない人は対象外。採点が終わったあとで来た人は、
--     そのまま 0 点で扱う(確定の記録がないので、点数は 0)。
--   * 受付を取り消された人は、新しい判定を付けられない(すでに付いた判定は残る)。
--
-- 画面の集計(順位・CSV・アナリティクス)と成績照会(disclose-result)も、同じ対象にそろえる。
-- 各関数の引数・返す列は変えない(create or replace。権限もそのまま)。

create or replace function public.list_question_answer_cards(
  p_project_id text,
  p_question_number integer
)
returns table (
  entry_id uuid,
  entry_number integer,
  affiliation text,
  grade text,
  storage_path text,
  page_width numeric,
  cell_region jsonb,
  cell_status text,
  cell_path text,
  cell_generation_version text
)
language sql
stable
set search_path = public
as $$
  select
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
    ap.cells #>> array['cellGeneration', 'version'] as cell_generation_version
  from public.answer_pages ap
  join public.entries e on e.id = ap.entry_id
  where ap.project_id = p_project_id
    and e.project_id = p_project_id
    and e.checked_in = true
  order by e.entry_number asc;
$$;

create or replace function public.list_score_conflicts(
  p_project_id text
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
  votes jsonb
)
language sql
stable
set search_path = public
as $$
  with project_settings as (
    select p.required_scorers
    from public.projects p
    where p.id = p_project_id
      and public.has_project_role(p.id, array['owner', 'admin'])
  ),
  completed_questions as (
    select qs.question_number
    from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.completed_at is not null
    group by qs.question_number
    having count(*) >= (select required_scorers from project_settings)
  )
  select
    cq.question_number,
    ap.entry_id,
    e.entry_number,
    e.affiliation,
    e.grade,
    ap.storage_path,
    nullif(ap.cells->>'pageWidth', '')::numeric as page_width,
    ap.cells->'regions'->('q' || cq.question_number::text) as cell_region,
    case
      when ap.cells #>> array['cellGeneration', 'version'] = 'answer-cell-v1'
       and ap.cells #>> array['cellGeneration', 'questions', 'q' || cq.question_number::text] = 'ready'
        then 'ready'
      else null
    end as cell_status,
    case
      when ap.cells #>> array['cellGeneration', 'version'] = 'answer-cell-v1'
       and ap.cells #>> array['cellGeneration', 'questions', 'q' || cq.question_number::text] = 'ready'
        then p_project_id || '/' || e.entry_number::text || '/q' || cq.question_number::text || '.webp'
      else null
    end as cell_path,
    ap.cells #>> array['cellGeneration', 'version'] as cell_generation_version,
    ma.answer as model_answer,
    coalesce(ma.alt_answers, '{}') as model_alt_answers,
    fr.result as final_result,
    vc.votes
  from completed_questions cq
  cross join project_settings ps
  join public.answer_pages ap
    on ap.project_id = p_project_id
  join public.entries e
    on e.id = ap.entry_id
   and e.project_id = p_project_id
   and e.checked_in = true
  left join public.model_answers ma
    on ma.project_id = p_project_id
   and ma.question_number = cq.question_number
  left join public.final_results fr
    on fr.project_id = p_project_id
   and fr.question_number = cq.question_number
   and fr.entry_id = ap.entry_id
  left join lateral (
    select
      count(*) filter (where sv.result = 'correct') as corrects,
      count(*) filter (where sv.result = 'wrong') as wrongs,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'scorer_member_id', sv.scorer_member_id,
            'result', sv.result
          )
          order by sv.scorer_member_id
        ) filter (where sv.id is not null),
        '[]'::jsonb
      ) as votes
    from public.score_votes sv
    where sv.project_id = p_project_id
      and sv.question_number = cq.question_number
      and sv.entry_id = ap.entry_id
  ) vc on true
  where coalesce(vc.corrects, 0) < ps.required_scorers
    and coalesce(vc.wrongs, 0) < ps.required_scorers
  order by cq.question_number asc, e.entry_number asc;
$$;

create or replace function public.complete_question_scoring(
  p_project_id text,
  p_question_number integer
)
returns table(completed boolean, finalized_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_required integer;
  v_completed_count integer;
  v_finalized integer := 0;
  v_entry record;
  v_correct_count integer;
  v_wrong_count integer;
  v_result text;
begin
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'Forbidden';
  end if;

  update public.question_scorers
    set completed_at = now()
    where project_id = p_project_id
      and question_number = p_question_number
      and scorer_member_id = v_member_id;

  select required_scorers into v_required
  from public.projects
  where id = p_project_id;

  select count(*) into v_completed_count
  from public.question_scorers qs
  where qs.project_id = p_project_id
    and qs.question_number = p_question_number
    and qs.completed_at is not null;

  if v_completed_count < v_required then
    return query select true, 0;
    return;
  end if;

  for v_entry in
    select e.id
    from public.entries e
    where e.project_id = p_project_id
      and e.checked_in = true
  loop
    select
      count(*) filter (where sv.result = 'correct'),
      count(*) filter (where sv.result = 'wrong')
    into v_correct_count, v_wrong_count
    from public.score_votes sv
    where sv.project_id = p_project_id
      and sv.question_number = p_question_number
      and sv.entry_id = v_entry.id;

    v_result := null;
    if v_correct_count >= v_required then
      v_result := 'correct';
    elsif v_wrong_count >= v_required then
      v_result := 'wrong';
    end if;

    if v_result is not null then
      insert into public.final_results(project_id, question_number, entry_id, result, decided_by)
      values (p_project_id, p_question_number, v_entry.id, v_result, v_member_id)
      on conflict (project_id, question_number, entry_id) do nothing;
      if found then
        v_finalized := v_finalized + 1;
        insert into public.score_events(project_id, question_number, entry_id, actor_member_id, event_type, new_result)
        values (p_project_id, p_question_number, v_entry.id, v_member_id, 'finalized', v_result);
      end if;
    end if;
  end loop;

  return query select true, v_finalized;
end;
$$;

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
