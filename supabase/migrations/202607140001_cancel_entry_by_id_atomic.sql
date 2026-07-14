-- P2-e4: 認証済みエントリーIDでキャンセルする追加RPC。
--
-- 背景: 参加者認証は Edge(resolveParticipantAuth) で v2優先の dual-read に切り替わる。
--       従来の cancel_entry_atomic は RPC 内で旧 email_hash / disclosure_password_hash を
--       再照合しており、移行済み行でも旧SHA-256照合が残ってしまう。
--
-- 本migrationは「追加のみ」:
--   - 既存 cancel_entry_atomic は drop も replace もしない(旧列削除フェーズまで温存)。
--   - 認証済みの entry を id + project_id で確定する新関数を追加する。
--   - ロジック(advisory lock / FOR UPDATE / 各ガード / recompute / waitlist繰り上げ / 戻り値)は
--     現行 cancel_entry_atomic を厳密に踏襲し、entry の特定条件のみを id ベースへ変更する。
--
-- ロールバック: この関数を drop するだけで可能(既存資産・データには一切触れない)。

create or replace function public.cancel_entry_by_id_atomic(
  p_project_id text,
  p_entry_id uuid
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

  -- 認証は Edge(resolveParticipantAuth, v2優先)で完了済み。ここでは認証済み entry を
  -- id + project_id で確定する(旧hash照合は行わない)。
  select *
    into v_canceled
    from public.entries
    where project_id = p_project_id
      and id = p_entry_id
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

revoke all on function public.cancel_entry_by_id_atomic(text, uuid) from public, anon, authenticated;
grant execute on function public.cancel_entry_by_id_atomic(text, uuid) to service_role;

notify pgrst, 'reload schema';
