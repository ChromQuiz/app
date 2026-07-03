-- Tighten participant self-service state transitions and add a waitlist promotion deadline.

alter table public.projects
  add column if not exists waitlist_promotion_period_end timestamptz;

update public.projects
  set waitlist_promotion_period_end = period_end
  where waitlist_promotion_period_end is null
    and period_end is not null;

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
  v_effective_promotion_end timestamptz;
  v_can_promote boolean;
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
  if v_canceled.checked_in then
    raise exception 'Entry already checked in';
  end if;

  v_canceled_original_status := v_canceled.status;

  update public.entries
    set status = 'canceled'
    where id = v_canceled.id
      and checked_in = false
    returning * into v_canceled;

  if not found then
    raise exception 'Entry already checked in';
  end if;

  v_effective_promotion_end := coalesce(v_project.waitlist_promotion_period_end, v_project.period_end);
  v_can_promote := v_effective_promotion_end is null or v_effective_promotion_end >= now();

  if v_can_promote and v_canceled_original_status <> 'waitlist' then
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
