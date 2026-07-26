-- V3: participant_auth_events の既存ハッシュを HMAC(pepper) 化するため、service_role に UPDATE を付与する。
--
-- 背景: 202607060001 で本テーブルは anon/authenticated から revoke 済みだが、service_role には
--   SELECT / INSERT のみが付与されており UPDATE が無い(email_events は 202607020001 で UPDATE 付与済み)。
--   そのため Edge Functions(service_role) から既存行を再ハッシュできない。
--
-- 付与するのは UPDATE のみ(DELETE は付与しない=履歴の破壊的操作を許可しない)。
-- RLS は有効のままで、ポリシーは一切作らない(anon/authenticated からは引き続き到達不能)。

grant update on public.participant_auth_events to service_role;

notify pgrst, 'reload schema';
