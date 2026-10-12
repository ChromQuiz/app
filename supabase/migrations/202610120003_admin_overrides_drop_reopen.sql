-- 「開き直す」をやめて、管理者が直接、確定を覆す形にする。
--
--   - 3人とも間違えていたような問題は、枠を開き直しても、同じ判断を要確認でもう一度しないといけない。
--     管理者が、問題を開いて、全員の答案の確定を直接直す(resolve_score_conflict は、いつでも使える)。
--   - 管理者が、判定が一致していた答案を覆したものを、要確認の先頭に並べるための一覧
--     list_admin_overrides を足す。
--   - reopen_question_scoring は、使わなくなったので消す。

drop function if exists public.reopen_question_scoring(text, integer, uuid);

-- 管理者が決めた確定のうち、採点者の判定は一致していたもの(要確認に出ない答案を、管理者が覆したもの)。
create or replace function public.list_admin_overrides(
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
  decided_kind text,
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
  )
  select
    fr.question_number,
    ap.entry_id,
    e.entry_number,
    e.affiliation,
    e.grade,
    ap.storage_path,
    nullif(ap.cells->>'pageWidth', '')::numeric as page_width,
    ap.cells->'regions'->('q' || fr.question_number::text) as cell_region,
    case
      when ap.cells #>> array['cellGeneration', 'version'] = 'answer-cell-v1'
       and ap.cells #>> array['cellGeneration', 'questions', 'q' || fr.question_number::text] = 'ready'
        then 'ready'
      else null
    end as cell_status,
    case
      when ap.cells #>> array['cellGeneration', 'version'] = 'answer-cell-v1'
       and ap.cells #>> array['cellGeneration', 'questions', 'q' || fr.question_number::text] = 'ready'
        then p_project_id || '/' || e.entry_number::text || '/q' || fr.question_number::text || '.webp'
      else null
    end as cell_path,
    ap.cells #>> array['cellGeneration', 'version'] as cell_generation_version,
    ma.answer as model_answer,
    coalesce(ma.alt_answers, '{}') as model_alt_answers,
    fr.result as final_result,
    fr.decided_kind,
    vc.votes
  from public.final_results fr
  cross join project_settings ps
  join public.entries e
    on e.id = fr.entry_id
   and e.project_id = p_project_id
   and e.checked_in = true
  join public.answer_pages ap
    on ap.entry_id = fr.entry_id
   and ap.project_id = p_project_id
  left join public.model_answers ma
    on ma.project_id = p_project_id
   and ma.question_number = fr.question_number
  left join lateral (
    select
      count(*) filter (where sv.result = 'correct') as corrects,
      count(*) filter (where sv.result = 'wrong') as wrongs,
      coalesce(
        jsonb_agg(
          jsonb_build_object('scorer_member_id', sv.scorer_member_id, 'result', sv.result)
          order by sv.scorer_member_id
        ) filter (where sv.id is not null),
        '[]'::jsonb
      ) as votes
    from public.score_votes sv
    where sv.project_id = p_project_id
      and sv.question_number = fr.question_number
      and sv.entry_id = fr.entry_id
  ) vc on true
  where fr.project_id = p_project_id
    and fr.decided_kind = 'admin'
    and (coalesce(vc.corrects, 0) >= ps.required_scorers or coalesce(vc.wrongs, 0) >= ps.required_scorers)
  order by fr.question_number asc, e.entry_number asc;
$$;

revoke all on function public.list_admin_overrides(text) from public, anon;
grant execute on function public.list_admin_overrides(text) to authenticated;
