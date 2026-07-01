-- Return only the answer page metadata needed by a single question view.
-- This avoids transferring every stored cell region for every answer page.

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
  cell_region jsonb
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
    ap.cells->'regions'->('q' || p_question_number::text) as cell_region
  from public.answer_pages ap
  join public.entries e on e.id = ap.entry_id
  where ap.project_id = p_project_id
    and e.project_id = p_project_id
  order by e.entry_number asc;
$$;

grant execute on function public.list_question_answer_cards(text, integer) to authenticated;
