-- Expose answer-cell cache metadata to question and conflict screens.
-- answer_pages.cells.regions remains the source of truth; answer-cells is only a display cache.

drop function if exists public.list_question_answer_cards(text, integer);

create or replace function public.list_question_answer_cards(
  p_project_id text,
  p_question_number integer
)
returns table (
  entry_id uuid,
  entry_number integer,
  entry_name text,
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
    e.entry_name,
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
  order by e.entry_number asc;
$$;

grant execute on function public.list_question_answer_cards(text, integer) to authenticated;

drop function if exists public.list_score_conflicts(text);

create or replace function public.list_score_conflicts(
  p_project_id text
)
returns table (
  question_number integer,
  entry_id uuid,
  entry_number integer,
  entry_name text,
  affiliation text,
  grade text,
  storage_path text,
  page_width numeric,
  cell_region jsonb,
  cell_status text,
  cell_path text,
  cell_generation_version text,
  model_answer text,
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
    e.entry_name,
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
    fr.result as final_result,
    vc.votes
  from completed_questions cq
  cross join project_settings ps
  join public.answer_pages ap
    on ap.project_id = p_project_id
  join public.entries e
    on e.id = ap.entry_id
   and e.project_id = p_project_id
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

grant execute on function public.list_score_conflicts(text) to authenticated;
