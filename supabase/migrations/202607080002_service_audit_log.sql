-- service_role 経路(Edge Functions)向けの監査ログ拡張。
-- 参加者/運営の状態変更アクションを記録する。生IPやPIIは保存しない。
-- 既存の audit_logs 行・既存ポリシー・既存 log_audit_event は変更しない(追加のみ)。

alter table public.audit_logs
  add column if not exists actor_kind text,       -- 'participant' | 'staff' | 'system'
  add column if not exists actor_ip_hash text;    -- HMAC(pepper, ip)。生IPは保存しない

create or replace function public.log_service_event(
  p_project_id text,
  p_action text,
  p_target_id text default null,
  p_actor_kind text default 'system',
  p_actor_ip_hash text default null,
  p_actor_user_id uuid default null,
  p_actor_member_id uuid default null,
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
    actor_kind,
    actor_ip_hash,
    action,
    target_table,
    target_id,
    before_data,
    after_data
  )
  values (
    p_project_id,
    p_actor_user_id,
    p_actor_member_id,
    p_actor_kind,
    p_actor_ip_hash,
    p_action,
    'entries',
    p_target_id,
    null,
    p_after_data
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- service role 専用(anon/authenticated からは実行不可)
revoke all on function public.log_service_event(text, text, text, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.log_service_event(text, text, text, text, text, uuid, uuid, jsonb) to service_role;
