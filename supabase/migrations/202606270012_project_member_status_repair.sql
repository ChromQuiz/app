-- Repair/guarantee project member status for remote databases that were created
-- before member management hardening was fully applied.

alter table public.project_members
  add column if not exists status text not null default 'active'
    check (status in ('active', 'removed'));
