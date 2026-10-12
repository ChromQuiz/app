-- 「確定している」の判定を、1つの定義にまとめる。
--
-- これまでは、結果タブの集計、問題アナリティクス、成績照会が、それぞれ別の計算をしていた
-- (アナリティクスは「確定結果が1件でもあれば確定」で、要確認が残る問題も確定扱いにしていた)。
-- 問題ごとの状態を返す内部の関数 question_confirmation_rows を唯一の定義にして、
--   - 成績照会の確認(scoring_confirmation。service_role のみ)
--   - 管理者の画面(list_question_confirmation。owner / admin のみ)
-- の両方が、これを使う。

create or replace function public.question_confirmation_rows(p_project_id text)
returns table (
  question_number integer,
  required_scorers integer,
  joined_scorers integer,
  completed_scorers integer,
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
  qs as (
    select g.q as question_number from p, generate_series(1, p.question_count) as g(q)
  ),
  slot as (
    select s.question_number,
           count(*)::integer as joined,
           (count(*) filter (where s.completed_at is not null))::integer as done
    from public.question_scorers s
    where s.project_id = p_project_id
    group by s.question_number
  ),
  unresolved as (
    -- list_score_conflicts と同じ定義: 採点が完了した問題で、当日受付を済ませた人で答案があり、
    -- 判定が一致しておらず、確定結果がない答案
    select sl.question_number, count(*)::integer as n
    from slot sl
    cross join p
    join public.answer_pages ap on ap.project_id = p_project_id
    join public.entries e
      on e.id = ap.entry_id and e.project_id = p_project_id and e.checked_in = true
    left join public.final_results fr
      on fr.project_id = p_project_id and fr.question_number = sl.question_number and fr.entry_id = ap.entry_id
    left join lateral (
      select
        count(*) filter (where sv.result = 'correct') as corrects,
        count(*) filter (where sv.result = 'wrong') as wrongs
      from public.score_votes sv
      where sv.project_id = p_project_id
        and sv.question_number = sl.question_number
        and sv.entry_id = ap.entry_id
    ) vc on true
    where sl.done >= p.required_scorers
      and fr.entry_id is null
      and coalesce(vc.corrects, 0) < p.required_scorers
      and coalesce(vc.wrongs, 0) < p.required_scorers
    group by sl.question_number
  )
  select
    qs.question_number,
    p.required_scorers,
    coalesce(sl.joined, 0),
    coalesce(sl.done, 0),
    coalesce(u.n, 0),
    coalesce(sl.done, 0) >= p.required_scorers and coalesce(u.n, 0) = 0
  from qs
  cross join p
  left join slot sl on sl.question_number = qs.question_number
  left join unresolved u on u.question_number = qs.question_number
  order by qs.question_number;
$$;

revoke all on function public.question_confirmation_rows(text) from public, anon, authenticated;

-- 成績照会の確認(service_role のみ)。問題ごとの定義をそのまま使う。
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
  select
    pr.question_count,
    (select count(*)::integer from public.question_confirmation_rows(p_project_id) r where r.completed_scorers >= r.required_scorers),
    coalesce((select sum(r.unresolved_conflicts)::integer from public.question_confirmation_rows(p_project_id) r), 0),
    pr.question_count > 0
      and (select count(*) from public.question_confirmation_rows(p_project_id) r where r.confirmed) = pr.question_count
  from public.projects pr
  where pr.id = p_project_id;
$$;

revoke all on function public.scoring_confirmation(text) from public, anon, authenticated;
grant execute on function public.scoring_confirmation(text) to service_role;

-- 管理者の画面(結果タブ・問題アナリティクス・成績照会の公開・出力)用。問題ごとの状態。
create or replace function public.list_question_confirmation(p_project_id text)
returns table (
  question_number integer,
  required_scorers integer,
  joined_scorers integer,
  completed_scorers integer,
  unresolved_conflicts integer,
  confirmed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.question_confirmation_rows(p_project_id) r
  where public.has_project_role(p_project_id, array['owner', 'admin']);
$$;

revoke all on function public.list_question_confirmation(text) from public, anon;
grant execute on function public.list_question_confirmation(text) to authenticated;
