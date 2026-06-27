-- Scorers need to read answer images for grading, but only owners/admins should
-- upload, replace, or delete answer assets and metadata.

drop policy if exists answer_pages_write_admin_scorer on public.answer_pages;
create policy answer_pages_write_admin
on public.answer_pages for all
using (public.has_project_role(project_id, array['owner', 'admin']))
with check (public.has_project_role(project_id, array['owner', 'admin']));

drop policy if exists answer_pages_storage_write_admin_scorer on storage.objects;
create policy answer_pages_storage_write_admin
on storage.objects for all
using (
  bucket_id = 'answer-pages'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
)
with check (
  bucket_id = 'answer-pages'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
);

drop policy if exists answer_cells_storage_write_admin_scorer on storage.objects;
create policy answer_cells_storage_write_admin
on storage.objects for all
using (
  bucket_id = 'answer-cells'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
)
with check (
  bucket_id = 'answer-cells'
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
);
