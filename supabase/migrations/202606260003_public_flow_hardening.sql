-- CIQ Supabase public-flow hardening.
-- Adds sanitized realtime entry list, disclosure period gates, and atomic cancel/promotion.

alter table public.projects
  add column if not exists disclosure_period_start timestamptz,
  add column if not exists disclosure_period_end timestamptz;

alter table public.entries
  add column if not exists waitlist_promoted_at timestamptz,
  add column if not exists waitlist_promotion_notice text
    check (waitlist_promotion_notice is null or waitlist_promotion_notice in ('pending', 'sending', 'sent', 'failed'));

alter table public.entries
  drop constraint if exists entries_project_id_email_hash_key;

create unique index if not exists entries_active_email_unique_idx
  on public.entries(project_id, email_hash)
  where status <> 'canceled';

create table if not exists public.public_project_settings (
  project_id text primary key references public.projects(id) on delete cascade,
  project_name text not null,
  rsa_public_key jsonb,
  entry_open boolean not null default false,
  period_start timestamptz,
  period_end timestamptz,
  max_entries integer not null default 0,
  disclosure_enabled boolean not null default false,
  disclosure_period_start timestamptz,
  disclosure_period_end timestamptz,
  terms text,
  reply_to text,
  updated_at timestamptz not null default now()
);

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
    reply_to,
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
    new.reply_to,
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
        reply_to = excluded.reply_to,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists projects_sync_public_project_settings on public.projects;
create trigger projects_sync_public_project_settings
after insert or update or delete on public.projects
for each row execute function public.sync_public_project_settings();

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
  reply_to,
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
  p.reply_to,
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
      reply_to = excluded.reply_to,
      updated_at = now();

alter table public.public_project_settings enable row level security;

drop policy if exists public_project_settings_select_anon on public.public_project_settings;
create policy public_project_settings_select_anon
on public.public_project_settings for select
using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('answer-pages', 'answer-pages', false, 20971520, array['image/webp', 'image/png', 'image/jpeg', 'application/pdf']),
  ('answer-cells', 'answer-cells', false, 5242880, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists answer_pages_storage_select_member on storage.objects;
create policy answer_pages_storage_select_member
on storage.objects for select
using (
  bucket_id = 'answer-pages'
  and public.is_project_member((storage.foldername(name))[1])
);

drop policy if exists answer_pages_storage_write_admin_scorer on storage.objects;
create policy answer_pages_storage_write_admin_scorer
on storage.objects for all
using (
  bucket_id = 'answer-pages'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin', 'scorer'])
)
with check (
  bucket_id = 'answer-pages'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin', 'scorer'])
);

drop policy if exists answer_cells_storage_select_member on storage.objects;
create policy answer_cells_storage_select_member
on storage.objects for select
using (
  bucket_id = 'answer-cells'
  and public.is_project_member((storage.foldername(name))[1])
);

drop policy if exists answer_cells_storage_write_admin_scorer on storage.objects;
create policy answer_cells_storage_write_admin_scorer
on storage.objects for all
using (
  bucket_id = 'answer-cells'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin', 'scorer'])
)
with check (
  bucket_id = 'answer-cells'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin', 'scorer'])
);

create table if not exists public.public_entry_list (
  project_id text not null references public.projects(id) on delete cascade,
  entry_id uuid primary key references public.entries(id) on delete cascade,
  entry_number integer not null,
  entry_name text,
  affiliation text,
  grade text,
  message text,
  is_chubu boolean not null default false,
  status text not null check (status in ('registered', 'waitlist', 'canceled', 'late')),
  checked_in boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists public_entry_list_project_number_idx
  on public.public_entry_list(project_id, entry_number);

do $$
begin
  alter publication supabase_realtime add table public.public_entry_list;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

create or replace function public.sync_public_entry_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.public_entry_list where entry_id = old.id;
    return old;
  end if;

  insert into public.public_entry_list (
    project_id,
    entry_id,
    entry_number,
    entry_name,
    affiliation,
    grade,
    message,
    is_chubu,
    status,
    checked_in,
    created_at,
    updated_at
  )
  values (
    new.project_id,
    new.id,
    new.entry_number,
    new.entry_name,
    new.affiliation,
    new.grade,
    new.message,
    new.is_chubu,
    new.status,
    new.checked_in,
    new.created_at,
    now()
  )
  on conflict (entry_id) do update
    set entry_number = excluded.entry_number,
        entry_name = excluded.entry_name,
        affiliation = excluded.affiliation,
        grade = excluded.grade,
        message = excluded.message,
        is_chubu = excluded.is_chubu,
        status = excluded.status,
        checked_in = excluded.checked_in,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists entries_sync_public_entry_list on public.entries;
create trigger entries_sync_public_entry_list
after insert or update or delete on public.entries
for each row execute function public.sync_public_entry_list();

insert into public.public_entry_list (
  project_id,
  entry_id,
  entry_number,
  entry_name,
  affiliation,
  grade,
  message,
  is_chubu,
  status,
  checked_in,
  created_at,
  updated_at
)
select
  e.project_id,
  e.id,
  e.entry_number,
  e.entry_name,
  e.affiliation,
  e.grade,
  e.message,
  e.is_chubu,
  e.status,
  e.checked_in,
  e.created_at,
  now()
from public.entries e
on conflict (entry_id) do update
  set entry_number = excluded.entry_number,
      entry_name = excluded.entry_name,
      affiliation = excluded.affiliation,
      grade = excluded.grade,
      message = excluded.message,
      is_chubu = excluded.is_chubu,
      status = excluded.status,
      checked_in = excluded.checked_in,
      updated_at = now();

alter table public.public_entry_list enable row level security;

drop policy if exists public_entry_list_select_when_entry_open on public.public_entry_list;
create policy public_entry_list_select_when_entry_open
on public.public_entry_list for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = public_entry_list.project_id
      and p.entry_open = true
  )
);

drop policy if exists public_entry_list_select_member on public.public_entry_list;
create policy public_entry_list_select_member
on public.public_entry_list for select
using (public.is_project_member(project_id));

create or replace function public.cancel_entry_atomic(
  p_project_id text,
  p_email_hash text,
  p_disclosure_password_hash text
)
returns table(
  canceled_entry_id uuid,
  canceled_entry_number integer,
  promoted_entry_id uuid,
  promoted_entry_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_canceled public.entries%rowtype;
  v_promoted public.entries%rowtype;
  v_canceled_original_status text;
begin
  select *
    into v_project
    from public.projects
    where id = p_project_id
    for update;

  if not found then
    raise exception 'Project not found';
  end if;

  select *
    into v_canceled
    from public.entries
    where project_id = p_project_id
      and email_hash = p_email_hash
      and disclosure_password_hash = p_disclosure_password_hash
      and status <> 'canceled'
    for update;

  if not found then
    raise exception 'Entry not found';
  end if;

  v_canceled_original_status := v_canceled.status;

  update public.entries
    set status = 'canceled'
    where id = v_canceled.id
    returning * into v_canceled;

  if v_canceled_original_status <> 'waitlist' then
    select *
      into v_promoted
      from public.entries
      where project_id = p_project_id
        and status = 'waitlist'
      order by created_at asc, entry_number asc
      limit 1
      for update skip locked;

    if found then
      update public.entries
        set status = 'registered',
            waitlist_promoted_at = now(),
            waitlist_promotion_notice = 'pending'
        where id = v_promoted.id
        returning * into v_promoted;
    end if;
  end if;

  return query select
    v_canceled.id,
    v_canceled.entry_number,
    v_promoted.id,
    v_promoted.entry_number;
end;
$$;

revoke all on function public.cancel_entry_atomic(text, text, text) from public, anon, authenticated;
grant execute on function public.cancel_entry_atomic(text, text, text) to service_role;

create or replace function public.create_entry_atomic(
  p_project_id text,
  p_encrypted_pii text,
  p_email_hash text,
  p_disclosure_password_hash text,
  p_entry_name text default null,
  p_affiliation text default null,
  p_grade text default null,
  p_message text default null,
  p_inquiry text default null,
  p_is_chubu boolean default false
)
returns table(id uuid, entry_number integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_active_count integer;
  v_entry_number integer;
  v_status text;
  v_entry_id uuid;
begin
  select *
    into v_project
    from public.projects
    where projects.id = p_project_id
    for update;

  if not found then
    raise exception 'Project not found';
  end if;
  if not v_project.entry_open then
    raise exception 'Entry is closed';
  end if;
  if v_project.period_start is not null and v_project.period_start > now() then
    raise exception 'Entry period has not started';
  end if;
  if v_project.period_end is not null and v_project.period_end < now() then
    raise exception 'Entry period has ended';
  end if;

  select count(*)
    into v_active_count
    from public.entries
    where entries.project_id = p_project_id
      and entries.status = 'registered';

  v_entry_number := v_project.last_entry_number + 1;
  v_status := case
    when v_project.max_entries > 0 and v_active_count >= v_project.max_entries then 'waitlist'
    else 'registered'
  end;

  insert into public.entries (
    project_id,
    entry_number,
    encrypted_pii,
    email_hash,
    disclosure_password_hash,
    entry_name,
    affiliation,
    grade,
    message,
    inquiry,
    is_chubu,
    status
  )
  values (
    p_project_id,
    v_entry_number,
    p_encrypted_pii,
    p_email_hash,
    p_disclosure_password_hash,
    p_entry_name,
    p_affiliation,
    p_grade,
    p_message,
    p_inquiry,
    coalesce(p_is_chubu, false),
    v_status
  )
  returning entries.id into v_entry_id;

  update public.projects
    set last_entry_number = v_entry_number
    where projects.id = p_project_id;

  return query select v_entry_id, v_entry_number, v_status;
end;
$$;

revoke all on function public.create_entry_atomic(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.create_entry_atomic(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
) to service_role;

create or replace function public.log_audit_event(
  p_project_id text,
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_before_data jsonb default null,
  p_after_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    project_id,
    actor_user_id,
    actor_member_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data
  )
  values (
    p_project_id,
    auth.uid(),
    case when p_project_id is null then null else public.current_member_id(p_project_id) end,
    p_action,
    p_target_table,
    p_target_id,
    p_before_data,
    p_after_data
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_audit_event(text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.log_audit_event(text, text, text, text, jsonb, jsonb) to authenticated;
