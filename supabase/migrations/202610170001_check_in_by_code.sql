-- 当日受付(二次元コード)の確認・照会・更新・記録を、1回のデータベース呼び出しにまとめる。
--
-- 背景: check-in の Edge Function は、project_members の確認 → entries の照会 → 更新 → 監査ログを、1つずつ順に待っていた。
--   データベースへの往復が 1回で済めば、その分だけ受付の結果が早く出る。
--
-- 守るもの(Edge Function の挙動と同じ):
--   - 権限: 有効(active)なメンバーで、役割が owner / admin / scorer のときだけ。違えば 'forbidden'(何も読まない・書かない)。
--   - 照会: project_id と checkin_token_hash の両方で引く。ほかの大会のコードでは見つからない。
--   - 更新: checked_in = false かつ status が registered / late のときだけ、条件つき UPDATE で原子的に行う。
--   - 監査ログ: 失敗しても受付は止めない(fail-open)。PII は渡さない。
--   - 呼べるのは service_role だけ。anon / authenticated からは実行できない(認証の確認は Edge Function が行い、user_id を渡す)。
--
-- 返す値(jsonb): { result, entry? }
--   result: forbidden | not_found | canceled | waitlist | already | success | conflict
create or replace function public.check_in_by_code(
  p_project_id text,
  p_user_id uuid,
  p_token_hash text,
  p_actor_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_entry public.entries%rowtype;
  v_payload jsonb;
begin
  if p_project_id is null or p_user_id is null or p_token_hash is null then
    return jsonb_build_object('result', 'forbidden');
  end if;

  select pm.id
    into v_member_id
    from public.project_members pm
   where pm.project_id = p_project_id
     and pm.user_id = p_user_id
     and pm.status = 'active'
     and pm.role in ('owner', 'admin', 'scorer');
  if v_member_id is null then
    return jsonb_build_object('result', 'forbidden');
  end if;

  select e.*
    into v_entry
    from public.entries e
   where e.project_id = p_project_id
     and e.checkin_token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_entry.status in ('canceled', 'waitlist') or v_entry.checked_in then
    return jsonb_build_object(
      'result', case when v_entry.status = 'canceled' then 'canceled'
                     when v_entry.status = 'waitlist' then 'waitlist'
                     else 'already' end,
      'entry', jsonb_build_object(
        'id', v_entry.id, 'entry_number', v_entry.entry_number, 'affiliation', v_entry.affiliation,
        'grade', v_entry.grade, 'status', v_entry.status, 'checked_in', v_entry.checked_in)
    );
  end if;

  update public.entries e
     set checked_in = true
   where e.id = v_entry.id
     and e.checked_in = false
     and e.status in ('registered', 'late')
  returning jsonb_build_object(
      'id', e.id, 'entry_number', e.entry_number, 'affiliation', e.affiliation,
      'grade', e.grade, 'status', e.status, 'checked_in', e.checked_in)
    into v_payload;
  if v_payload is null then
    return jsonb_build_object('result', 'conflict');
  end if;

  begin
    perform public.log_service_event(
      p_project_id, 'entry.checkin', v_entry.id::text, 'staff', p_actor_ip_hash,
      null, v_member_id, jsonb_build_object('checked_in', true));
  exception when others then
    null; -- 監査ログの失敗で受付を止めない
  end;

  return jsonb_build_object('result', 'success', 'entry', v_payload);
end;
$$;

revoke all on function public.check_in_by_code(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.check_in_by_code(text, uuid, text, text) to service_role;
