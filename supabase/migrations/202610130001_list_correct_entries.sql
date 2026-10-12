-- 問題ごとの「確定で正解になった、当日受付済みの人の受付番号」を、1回で返す。
--
-- 問題アナリティクス・採点結果CSV・採点済みPDFは、確定結果の「正解」だけを使う。
-- これまでは、確定結果の全件(1万件超)と、全判定(3万件超)を、1000件ずつ取り直していて、遅かった。
-- 問題ごとに、正解した人の受付番号の配列を返す(100行ほど)ので、1回の通信で済む。

create or replace function public.list_correct_entries(p_project_id text)
returns table (
  question_number integer,
  entry_numbers integer[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.q as question_number,
    coalesce(
      array_agg(e.entry_number order by e.entry_number) filter (where e.entry_number is not null),
      '{}'::integer[]
    ) as entry_numbers
  from public.projects p
  cross join lateral generate_series(1, p.question_count) as g(q)
  left join public.final_results fr
    on fr.project_id = p.id
   and fr.question_number = g.q
   and fr.result = 'correct'
  left join public.entries e
    on e.id = fr.entry_id
   and e.project_id = p.id
   and e.checked_in = true
  where p.id = p_project_id
    and public.has_project_role(p.id, array['owner', 'admin'])
  group by g.q
  order by g.q;
$$;

revoke all on function public.list_correct_entries(text) from public, anon;
grant execute on function public.list_correct_entries(text) to authenticated;
