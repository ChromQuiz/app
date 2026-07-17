-- Make the public entry list visible to everyone regardless of entry_open.
--
-- Background: public_entry_list had two SELECT policies (OR'd):
--   1) visible when projects.entry_open = true
--   2) visible to project members (organizers)
-- When entry_open was false, anonymous visitors saw zero rows, even though the
-- entry list page is meant to be publicly viewable. The entry_open flag still
-- gates new-entry acceptance (entry.html / create_entry_atomic) and must stay
-- intact; this change only relaxes read visibility of the list itself.
--
-- We add a third policy (additive) that exposes non-canceled rows to all roles.
-- Canceled rows remain hidden at the DB layer. PII is not stored in this table,
-- so no new data is exposed.

drop policy if exists public_entry_list_select_public_active on public.public_entry_list;
create policy public_entry_list_select_public_active
on public.public_entry_list for select
using (status <> 'canceled');
