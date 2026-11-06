-- 大会ごとのアイコン(ブラウザのタブに出るファビコン)
--
-- 参加者向けページ(entry / entry_list / my / terms)は、URL の pid の大会に
--   <SUPABASE_URL>/storage/v1/object/public/project-icon/<project_id>/icon.png
-- があれば、ページを開いたあとにタブのアイコンを差し替える(js/project_icon.js)。
-- 無ければ CIQ のロゴのまま。
--
-- バケットは公開(public = true)。置けるのは各大会のフォルダの icon.png だけで、
-- 中身はブラウザで PNG に再エンコードした正方形の画像(メタデータは残らない)。
-- 書き込み・削除は、その大会の有効な所有者・管理者だけ。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-icon', 'project-icon', true, 1048576, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 上書き(upsert)には select / insert / update が要る。元に戻す(既定のロゴにする)ために delete も許可する。
drop policy if exists project_icon_storage_select_admin on storage.objects;
create policy project_icon_storage_select_admin
on storage.objects for select
to authenticated
using (
  bucket_id = 'project-icon'
  and storage.filename(name) = 'icon.png'
  and array_length(storage.foldername(name), 1) = 1
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
);

drop policy if exists project_icon_storage_insert_admin on storage.objects;
create policy project_icon_storage_insert_admin
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'project-icon'
  and storage.filename(name) = 'icon.png'
  and array_length(storage.foldername(name), 1) = 1
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
);

drop policy if exists project_icon_storage_update_admin on storage.objects;
create policy project_icon_storage_update_admin
on storage.objects for update
to authenticated
using (
  bucket_id = 'project-icon'
  and storage.filename(name) = 'icon.png'
  and array_length(storage.foldername(name), 1) = 1
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
)
with check (
  bucket_id = 'project-icon'
  and storage.filename(name) = 'icon.png'
  and array_length(storage.foldername(name), 1) = 1
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
);

drop policy if exists project_icon_storage_delete_admin on storage.objects;
create policy project_icon_storage_delete_admin
on storage.objects for delete
to authenticated
using (
  bucket_id = 'project-icon'
  and storage.filename(name) = 'icon.png'
  and array_length(storage.foldername(name), 1) = 1
  and public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])
);
