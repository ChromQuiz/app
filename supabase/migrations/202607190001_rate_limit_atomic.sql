-- V4（親計画 docs/security-hardening-plan.md）: IP レート制限を並列安全（アトミック）にする。
--
-- 背景: 従来の enforceIpRateLimit は「select count(...) → insert」の2段で、両者が非アトミック（TOCTOU）。
--   本番実証（2026-07-19）: 単一 IP から 25 並列の誤認証がすべて 404（既定上限 20/10分を 0 件の 429 で突破）。
--   全並列リクエストが insert 前に count<limit を読むため、上限を超えて通過してしまう。
--
-- 対策: (bucket, scope_key) 単位の pg_advisory_xact_lock でカウント判定〜挿入を直列化する RPC を新設。
--   直列化により各呼び出しは直前までの「コミット済み」件数を正しく見るため、並列でも上限をちょうど超えない。
--   上限到達後は insert しない（テーブル肥大化を抑止しつつ窓件数は正確に保つ）。
--   service_role（Edge Functions）専用。生 IP は扱わない（呼び出し側が HMAC 化した scope_key を渡す）。

create or replace function public.rate_limit_hit(
  p_bucket text,
  p_scope_key text,
  p_window_seconds integer,
  p_limit integer,
  p_project_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- 同一 (bucket, scope_key) をシリアライズし、count→insert の TOCTOU レースを排除する。
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_scope_key));

  select count(*)
    into v_count
    from public.rate_limit_events
    where bucket = p_bucket
      and scope_key = p_scope_key
      and created_at > now() - make_interval(secs => greatest(p_window_seconds, 1));

  -- 上限未満のときだけ記録する（超過分は挿入しない＝窓件数は上限で頭打ち・肥大化防止）。
  if v_count < p_limit then
    insert into public.rate_limit_events (bucket, scope_key, project_id)
      values (p_bucket, p_scope_key, p_project_id);
  end if;

  -- このヒットを含まない、直前までの窓内件数を返す。呼び出し側は v_count >= limit で 429。
  return v_count;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer, text) to service_role;

notify pgrst, 'reload schema';
