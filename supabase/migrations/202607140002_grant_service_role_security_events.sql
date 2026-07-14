-- P2-e4 補正: security event テーブルへの service_role アクセス付与。
--
-- 背景: participant_auth_events / rate_limit_events は作成時に
--       `revoke all from anon, authenticated` のみで service_role へ grant されておらず、
--       service_role が SELECT/INSERT 不可の状態だった。
--   - participant_auth_events: Edge の enforceAuthRateLimit(SELECT) / recordAuthAttempt(INSERT)。
--     SELECT が権限拒否で throw され、credential 認証が 500 になっていた(fail-closed 経路)。
--   - rate_limit_events: Edge の enforceIpRateLimit(SELECT/INSERT)。fail-open のため 500 にはならないが
--     権限拒否で IP レート制限が実効していなかった。
--
-- 付与は必要最小限(SELECT, INSERT)・service_role のみ。UPDATE/DELETE/TRUNCATE は付与しない。
-- anon / authenticated へは付与しない(既存の revoke を維持)。
--
-- audit_logs は対象外: 監査は SECURITY DEFINER の log_service_event RPC 経由で INSERT され、
--   関数 owner(postgres) が audit_logs へ INSERT 可能・service_role は関数 EXECUTE 権限を持つため、
--   テーブルへの直接 grant は不要(権限範囲を広げない)。
--
-- ロールバック:
--   revoke select, insert on table public.participant_auth_events from service_role;
--   revoke select, insert on table public.rate_limit_events from service_role;

grant select, insert on table public.participant_auth_events to service_role;
grant select, insert on table public.rate_limit_events to service_role;
