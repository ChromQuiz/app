-- CIQ Supabase RLS policies, phase 1.

create or replace function public.is_project_member(target_project_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.has_project_role(target_project_id text, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  );
$$;

create or replace function public.current_member_id(target_project_id text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select pm.id
  from public.project_members pm
  where pm.project_id = target_project_id
    and pm.user_id = auth.uid()
  limit 1;
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.entries enable row level security;
alter table public.answer_pages enable row level security;
alter table public.model_answers enable row level security;
alter table public.score_votes enable row level security;
alter table public.score_events enable row level security;
alter table public.final_results enable row level security;
alter table public.audit_logs enable row level security;
alter table public.email_events enable row level security;

-- projects
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member
on public.projects for select
using (public.is_project_member(id));

drop policy if exists projects_insert_owner_candidate on public.projects;
create policy projects_insert_owner_candidate
on public.projects for insert
with check (auth.uid() = created_by);

drop policy if exists projects_update_admin on public.projects;
create policy projects_update_admin
on public.projects for update
using (public.has_project_role(id, array['owner', 'admin']))
with check (public.has_project_role(id, array['owner', 'admin']));

drop policy if exists projects_delete_owner on public.projects;
create policy projects_delete_owner
on public.projects for delete
using (public.has_project_role(id, array['owner']));

-- project_members
drop policy if exists project_members_select_member on public.project_members;
create policy project_members_select_member
on public.project_members for select
using (public.is_project_member(project_id));

drop policy if exists project_members_write_owner_admin on public.project_members;
create policy project_members_write_owner_admin
on public.project_members for all
using (public.has_project_role(project_id, array['owner', 'admin']))
with check (public.has_project_role(project_id, array['owner', 'admin']));

-- entries: public participant flows must go through Edge Functions/service role.
drop policy if exists entries_select_member on public.entries;
create policy entries_select_member
on public.entries for select
using (public.is_project_member(project_id));

drop policy if exists entries_update_admin on public.entries;
create policy entries_update_admin
on public.entries for update
using (public.has_project_role(project_id, array['owner', 'admin']))
with check (public.has_project_role(project_id, array['owner', 'admin']));

drop policy if exists entries_delete_owner_admin on public.entries;
create policy entries_delete_owner_admin
on public.entries for delete
using (public.has_project_role(project_id, array['owner', 'admin']));

-- answer_pages
drop policy if exists answer_pages_select_member on public.answer_pages;
create policy answer_pages_select_member
on public.answer_pages for select
using (public.is_project_member(project_id));

drop policy if exists answer_pages_write_admin_scorer on public.answer_pages;
create policy answer_pages_write_admin_scorer
on public.answer_pages for all
using (public.has_project_role(project_id, array['owner', 'admin', 'scorer']))
with check (public.has_project_role(project_id, array['owner', 'admin', 'scorer']));

-- model_answers
drop policy if exists model_answers_select_member on public.model_answers;
create policy model_answers_select_member
on public.model_answers for select
using (public.is_project_member(project_id));

drop policy if exists model_answers_write_admin on public.model_answers;
create policy model_answers_write_admin
on public.model_answers for all
using (public.has_project_role(project_id, array['owner', 'admin']))
with check (public.has_project_role(project_id, array['owner', 'admin']));

-- score_votes
drop policy if exists score_votes_select_member on public.score_votes;
create policy score_votes_select_member
on public.score_votes for select
using (public.is_project_member(project_id));

drop policy if exists score_votes_insert_self on public.score_votes;
create policy score_votes_insert_self
on public.score_votes for insert
with check (
  public.has_project_role(project_id, array['owner', 'admin', 'scorer'])
  and scorer_member_id = public.current_member_id(project_id)
);

drop policy if exists score_votes_update_self_or_admin on public.score_votes;
create policy score_votes_update_self_or_admin
on public.score_votes for update
using (
  public.has_project_role(project_id, array['owner', 'admin'])
  or scorer_member_id = public.current_member_id(project_id)
)
with check (
  public.has_project_role(project_id, array['owner', 'admin'])
  or scorer_member_id = public.current_member_id(project_id)
);

-- Score events are append-only from the client perspective.
drop policy if exists score_events_select_member on public.score_events;
create policy score_events_select_member
on public.score_events for select
using (public.is_project_member(project_id));

drop policy if exists score_events_insert_member on public.score_events;
create policy score_events_insert_member
on public.score_events for insert
with check (
  public.has_project_role(project_id, array['owner', 'admin', 'scorer'])
  and (
    actor_member_id is null
    or actor_member_id = public.current_member_id(project_id)
    or public.has_project_role(project_id, array['owner', 'admin'])
  )
);

-- final_results
drop policy if exists final_results_select_member on public.final_results;
create policy final_results_select_member
on public.final_results for select
using (public.is_project_member(project_id));

drop policy if exists final_results_write_admin on public.final_results;
create policy final_results_write_admin
on public.final_results for all
using (public.has_project_role(project_id, array['owner', 'admin']))
with check (public.has_project_role(project_id, array['owner', 'admin']));

-- audit_logs: readable by admins, appendable by members. No update/delete policy.
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs for select
using (project_id is not null and public.has_project_role(project_id, array['owner', 'admin']));

drop policy if exists audit_logs_insert_member on public.audit_logs;
create policy audit_logs_insert_member
on public.audit_logs for insert
with check (project_id is null or public.is_project_member(project_id));

-- email_events: admins can inspect delivery state. Writes happen from Edge Functions/service role.
drop policy if exists email_events_select_admin on public.email_events;
create policy email_events_select_admin
on public.email_events for select
using (project_id is not null and public.has_project_role(project_id, array['owner', 'admin']));
