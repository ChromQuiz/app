-- Allow Edge Functions using the service role to verify project membership and update check-in state.

grant select on public.project_members to service_role;
grant select, update on public.entries to service_role;
