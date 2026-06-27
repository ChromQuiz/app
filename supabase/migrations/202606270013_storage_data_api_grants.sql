-- Explicit Storage API grants for authenticated admin/scorer uploads.
-- Bucket/object RLS policies still restrict access by project membership.

grant usage on schema storage to authenticated;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
