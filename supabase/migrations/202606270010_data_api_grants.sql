-- Explicit Data API grants.
-- RLS still decides which rows are visible or writable; these grants only allow
-- PostgREST roles to reach the tables/functions covered by the policies.

grant usage on schema public to anon, authenticated;

grant select on public.public_project_settings to anon, authenticated;
grant select on public.public_entry_list to anon, authenticated;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.answer_pages to authenticated;
grant select, insert, update, delete on public.model_answers to authenticated;
grant select, insert, update, delete on public.score_votes to authenticated;
grant select, insert on public.score_events to authenticated;
grant select, insert, update, delete on public.final_results to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select on public.email_events to authenticated;
grant select, insert, update, delete on public.question_scorers to authenticated;
