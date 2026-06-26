-- CIQ Supabase schema, phase 1.
-- Apply from Supabase SQL editor or `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id text primary key,
  name text not null,
  rsa_public_key jsonb,
  rsa_private_key_encrypted text,
  last_entry_number integer not null default 0,
  question_count integer not null default 100 check (question_count between 1 and 300),
  required_scorers integer not null default 3 check (required_scorers between 1 and 10),
  entry_open boolean not null default false,
  period_start timestamptz,
  period_end timestamptz,
  max_entries integer not null default 0 check (max_entries >= 0),
  disclosure_enabled boolean not null default false,
  terms text,
  reply_to text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null check (role in ('owner', 'admin', 'scorer')),
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id),
  unique (project_id, invited_email)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  entry_number integer not null,
  encrypted_pii text not null,
  email_hash text not null,
  disclosure_password_hash text,
  entry_name text,
  affiliation text,
  grade text,
  message text,
  inquiry text,
  is_chubu boolean not null default false,
  status text not null default 'registered' check (status in ('registered', 'waitlist', 'canceled', 'late')),
  checked_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, entry_number),
  unique (project_id, email_hash)
);

create table if not exists public.answer_pages (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  storage_path text,
  cells jsonb,
  uploaded_by uuid references public.project_members(id),
  uploaded_at timestamptz not null default now(),
  unique (project_id, entry_id)
);

create table if not exists public.model_answers (
  project_id text not null references public.projects(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  answer text not null,
  updated_by uuid references public.project_members(id),
  updated_at timestamptz not null default now(),
  primary key (project_id, question_number)
);

create table if not exists public.score_votes (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  entry_id uuid not null references public.entries(id) on delete cascade,
  scorer_member_id uuid not null references public.project_members(id) on delete restrict,
  result text not null check (result in ('correct', 'wrong', 'hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, question_number, entry_id, scorer_member_id)
);

create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  entry_id uuid not null references public.entries(id) on delete cascade,
  actor_member_id uuid references public.project_members(id) on delete set null,
  event_type text not null check (event_type in ('vote_created', 'vote_changed', 'finalized', 'final_changed', 'conflict_resolved')),
  old_result text,
  new_result text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.final_results (
  project_id text not null references public.projects(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  entry_id uuid not null references public.entries(id) on delete cascade,
  result text not null check (result in ('correct', 'wrong', 'hold')),
  decided_by uuid references public.project_members(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (project_id, question_number, entry_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_member_id uuid references public.project_members(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete set null,
  recipient_hash text not null,
  template text not null,
  provider text not null default 'ses',
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists project_members_project_idx on public.project_members(project_id);
create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists entries_project_number_idx on public.entries(project_id, entry_number);
create index if not exists entries_project_status_idx on public.entries(project_id, status);
create index if not exists answer_pages_project_idx on public.answer_pages(project_id);
create index if not exists score_votes_lookup_idx on public.score_votes(project_id, question_number, entry_id);
create index if not exists score_events_project_idx on public.score_events(project_id, created_at desc);
create index if not exists final_results_lookup_idx on public.final_results(project_id, question_number);
create index if not exists audit_logs_project_idx on public.audit_logs(project_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
before update on public.entries
for each row execute function public.touch_updated_at();

drop trigger if exists score_votes_touch_updated_at on public.score_votes;
create trigger score_votes_touch_updated_at
before update on public.score_votes
for each row execute function public.touch_updated_at();

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
      and entries.status <> 'canceled';

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
