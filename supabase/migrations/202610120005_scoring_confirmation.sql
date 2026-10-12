-- 成績照会は、全問が確定したあとだけ。
--
-- これまでは、管理者が成績照会を有効にすれば、確定が済んでいなくても、参加者に点数と順位を返していた。
-- 要確認が残っている答案は、確定結果がないため 0 点として数えられ、その順位が参加者に出てしまう。
-- 「全問の採点が完了していて、要確認が1件も残っていない」ことを返す関数を足し、
-- 成績照会の Edge Function(disclose-result)が、返す前に確かめる。

create or replace function public.scoring_confirmation(p_project_id text)
returns table (
  total_questions integer,
  completed_questions integer,
  unresolved_conflicts integer,
  confirmed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.question_count, pr.required_scorers
    from public.projects pr
    where pr.id = p_project_id
  ),
  completed as (
    select qs.question_number
    from public.question_scorers qs
    cross join p
    where qs.project_id = p_project_id
      and qs.completed_at is not null
      and qs.question_number between 1 and p.question_count
    group by qs.question_number, p.required_scorers
    having count(*) >= p.required_scorers
  ),
  unresolved as (
    -- list_score_conflicts と同じ定義: 当日受付を済ませた人で答案があり、判定が一致しておらず、確定結果がない
    select count(*)::integer as n
    from completed c
    cross join p
    join public.answer_pages ap on ap.project_id = p_project_id
    join public.entries e
      on e.id = ap.entry_id and e.project_id = p_project_id and e.checked_in = true
    left join public.final_results fr
      on fr.project_id = p_project_id and fr.question_number = c.question_number and fr.entry_id = ap.entry_id
    left join lateral (
      select
        count(*) filter (where sv.result = 'correct') as corrects,
        count(*) filter (where sv.result = 'wrong') as wrongs
      from public.score_votes sv
      where sv.project_id = p_project_id
        and sv.question_number = c.question_number
        and sv.entry_id = ap.entry_id
    ) vc on true
    where fr.entry_id is null
      and coalesce(vc.corrects, 0) < p.required_scorers
      and coalesce(vc.wrongs, 0) < p.required_scorers
  )
  select
    p.question_count,
    (select count(*)::integer from completed),
    (select n from unresolved),
    p.question_count > 0
      and (select count(*) from completed) >= p.question_count
      and (select n from unresolved) = 0
  from p;
$$;

-- 画面(anon / authenticated)からは呼べない。Edge Function(service_role)だけ。
revoke all on function public.scoring_confirmation(text) from public, anon, authenticated;
grant execute on function public.scoring_confirmation(text) to service_role;
