-- Keep stored entry status aligned with the public entry-list priority rule.
-- Rule: canceled entries are excluded; entries within 30 minutes from entry start
-- keep strict first-come order; later entries are ordered Chubu first, then others.

create or replace function public.recompute_entry_statuses(
  p_project_id text,
  p_allow_waitlist_promotion boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id));

  select *
    into v_project
    from public.projects
    where projects.id = p_project_id;

  if not found then
    raise exception 'Project not found';
  end if;

  with ranked as (
    select
      e.id,
      e.status as old_status,
      e.checked_in,
      row_number() over (
        order by
          case
            when v_project.period_start is null then 0
            when e.created_at <= v_project.period_start + interval '30 minutes' then 0
            when e.is_chubu then 1
            else 2
          end,
          e.created_at asc,
          e.entry_number asc
      ) as priority
    from public.entries e
    where e.project_id = p_project_id
      and e.status <> 'canceled'
  ),
  desired as (
    select
      id,
      old_status,
      checked_in,
      case
        when checked_in then old_status
        when v_project.max_entries <= 0 or priority <= v_project.max_entries then
          case when old_status = 'late' then 'late' else 'registered' end
        else 'waitlist'
      end as new_status
    from ranked
  )
  update public.entries e
    set
      status = case
        when desired.old_status = 'waitlist'
          and desired.new_status in ('registered', 'late')
          and not p_allow_waitlist_promotion
          then 'waitlist'
        else desired.new_status
      end,
      waitlist_promoted_at = case
        when desired.old_status = 'waitlist'
          and desired.new_status in ('registered', 'late')
          and p_allow_waitlist_promotion
          then coalesce(e.waitlist_promoted_at, now())
        when desired.new_status = 'waitlist'
          then null
        else e.waitlist_promoted_at
      end,
      waitlist_promotion_notice = case
        when desired.old_status = 'waitlist'
          and desired.new_status in ('registered', 'late')
          and p_allow_waitlist_promotion
          then coalesce(e.waitlist_promotion_notice, 'pending')
        when desired.new_status = 'waitlist'
          then null
        else e.waitlist_promotion_notice
      end
  from desired
  where e.id = desired.id
    and (
      e.status is distinct from case
        when desired.old_status = 'waitlist'
          and desired.new_status in ('registered', 'late')
          and not p_allow_waitlist_promotion
          then 'waitlist'
        else desired.new_status
      end
      or (
        desired.old_status = 'waitlist'
        and desired.new_status in ('registered', 'late')
        and p_allow_waitlist_promotion
        and e.waitlist_promotion_notice is null
      )
      or (
        desired.new_status = 'waitlist'
        and (e.waitlist_promoted_at is not null or e.waitlist_promotion_notice is not null)
      )
    );
end;
$$;

revoke all on function public.recompute_entry_statuses(text, boolean) from public, anon, authenticated;
grant execute on function public.recompute_entry_statuses(text, boolean) to service_role;

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
  v_entry_number integer;
  v_entry_id uuid;
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id));

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

  v_entry_number := v_project.last_entry_number + 1;

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
    'registered'
  )
  returning entries.id into v_entry_id;

  update public.projects
    set last_entry_number = v_entry_number
    where projects.id = p_project_id;

  perform public.recompute_entry_statuses(p_project_id, true);

  select entries.status
    into v_status
    from public.entries
    where entries.id = v_entry_id;

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
  v_canceled_original_status text;
  v_effective_promotion_end timestamptz;
  v_can_promote boolean;
  v_waitlist_before uuid[];
  v_promoted public.entries%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id));

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

  if v_canceled.checked_in then
    raise exception 'Checked-in entry cannot be canceled';
  end if;

  v_canceled_original_status := v_canceled.status;

  select array_agg(id order by created_at asc, entry_number asc)
    into v_waitlist_before
    from public.entries
    where project_id = p_project_id
      and status = 'waitlist';

  update public.entries
    set status = 'canceled'
    where id = v_canceled.id
    returning * into v_canceled;

  v_effective_promotion_end := coalesce(v_project.waitlist_promotion_period_end, v_project.period_end);
  v_can_promote := v_effective_promotion_end is null or now() <= v_effective_promotion_end;

  if v_canceled_original_status <> 'waitlist' and v_can_promote then
    perform public.recompute_entry_statuses(p_project_id, true);

    select *
      into v_promoted
      from public.entries
      where project_id = p_project_id
        and id = any(coalesce(v_waitlist_before, array[]::uuid[]))
        and status in ('registered', 'late')
      order by waitlist_promoted_at asc nulls last, created_at asc, entry_number asc
      limit 1;
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

create or replace function public.recompute_entry_statuses_after_project_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.max_entries is distinct from new.max_entries
    or old.period_start is distinct from new.period_start
  then
    perform public.recompute_entry_statuses(new.id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_recompute_entry_statuses on public.projects;
create trigger projects_recompute_entry_statuses
after update of max_entries, period_start on public.projects
for each row execute function public.recompute_entry_statuses_after_project_update();

do $$
declare
  v_project_id text;
begin
  for v_project_id in select id from public.projects loop
    perform public.recompute_entry_statuses(v_project_id, true);
  end loop;
end;
$$;
