-- Allow anonymous PostgREST requests to reach RLS-protected membership tables.
-- RLS still prevents anon users from seeing private rows because auth.uid() is null.

alter table public.project_members
  add column if not exists status text not null default 'active'
    check (status in ('active', 'removed'));

grant select on public.projects to anon;
grant select on public.project_members to anon;
