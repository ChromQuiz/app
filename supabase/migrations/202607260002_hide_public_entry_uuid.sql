-- V7: 公開エントリーリストから entry UUID を隠す。
--
-- 背景: public_entry_list.entry_id は entries.id（当日受付QRの中身）で、anon から誰でも読めた。
--   そのため任意の参加者の UUID を取得して QR を偽造し、受付を通せる状態だった。
--   QR は署名付きトークン化（_shared/qr_token.ts）したが、UUID 自体を公開し続ける必要もないため、
--   親計画 V7 の「少なくとも entry UUID を公開リストから除外」を満たすよう列単位で権限を絞る。
--
-- 方針: 行の可視性（RLS）は変更しない。列単位の GRANT だけを絞る
--   （既存の entries 機密列と同じ手法: 202606270015_restrict_entry_sensitive_columns.sql）。
--   entry_id 列とテーブル自体は残す（トリガ同期・主キー・on conflict が依存しているため）。

revoke select on public.public_entry_list from anon, authenticated;

grant select (
  project_id,
  entry_number,
  entry_name,
  affiliation,
  grade,
  message,
  is_chubu,
  status,
  checked_in,
  created_at,
  updated_at
) on public.public_entry_list to anon, authenticated;

notify pgrst, 'reload schema';
