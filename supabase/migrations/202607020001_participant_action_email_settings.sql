-- Add per-project notification settings for participant self-service actions.

alter table public.projects
  add column if not exists notify_entry_edit boolean not null default true,
  add column if not exists notify_entry_cancel boolean not null default true,
  add column if not exists notify_late_notice boolean not null default true;

alter table public.public_project_settings
  add column if not exists notify_entry_edit boolean not null default true,
  add column if not exists notify_entry_cancel boolean not null default true,
  add column if not exists notify_late_notice boolean not null default true;

grant select on public.projects to service_role;
grant select on public.entries to service_role;
grant select, insert, update on public.email_events to service_role;

create or replace function public.sync_public_project_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.public_project_settings where project_id = old.id;
    return old;
  end if;

  insert into public.public_project_settings (
    project_id,
    project_name,
    rsa_public_key,
    entry_open,
    period_start,
    period_end,
    max_entries,
    disclosure_enabled,
    disclosure_period_start,
    disclosure_period_end,
    terms,
    notify_entry_edit,
    notify_entry_cancel,
    notify_late_notice,
    updated_at
  )
  values (
    new.id,
    new.name,
    new.rsa_public_key,
    new.entry_open,
    new.period_start,
    new.period_end,
    new.max_entries,
    new.disclosure_enabled,
    new.disclosure_period_start,
    new.disclosure_period_end,
    new.terms,
    new.notify_entry_edit,
    new.notify_entry_cancel,
    new.notify_late_notice,
    now()
  )
  on conflict (project_id) do update
    set project_name = excluded.project_name,
        rsa_public_key = excluded.rsa_public_key,
        entry_open = excluded.entry_open,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        max_entries = excluded.max_entries,
        disclosure_enabled = excluded.disclosure_enabled,
        disclosure_period_start = excluded.disclosure_period_start,
        disclosure_period_end = excluded.disclosure_period_end,
        terms = excluded.terms,
        notify_entry_edit = excluded.notify_entry_edit,
        notify_entry_cancel = excluded.notify_entry_cancel,
        notify_late_notice = excluded.notify_late_notice,
        updated_at = now();

  return new;
end;
$$;

insert into public.public_project_settings (
  project_id,
  project_name,
  rsa_public_key,
  entry_open,
  period_start,
  period_end,
  max_entries,
  disclosure_enabled,
  disclosure_period_start,
  disclosure_period_end,
  terms,
  notify_entry_edit,
  notify_entry_cancel,
  notify_late_notice,
  updated_at
)
select
  p.id,
  p.name,
  p.rsa_public_key,
  p.entry_open,
  p.period_start,
  p.period_end,
  p.max_entries,
  p.disclosure_enabled,
  p.disclosure_period_start,
  p.disclosure_period_end,
  p.terms,
  p.notify_entry_edit,
  p.notify_entry_cancel,
  p.notify_late_notice,
  now()
from public.projects p
on conflict (project_id) do update
  set project_name = excluded.project_name,
      rsa_public_key = excluded.rsa_public_key,
      entry_open = excluded.entry_open,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      max_entries = excluded.max_entries,
      disclosure_enabled = excluded.disclosure_enabled,
      disclosure_period_start = excluded.disclosure_period_start,
      disclosure_period_end = excluded.disclosure_period_end,
      terms = excluded.terms,
      notify_entry_edit = excluded.notify_entry_edit,
      notify_entry_cancel = excluded.notify_entry_cancel,
      notify_late_notice = excluded.notify_late_notice,
      updated_at = now();
