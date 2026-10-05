-- 監査ログ（audit_logs）への書き込みを、サーバー側の処理だけに限る。
--
-- 状況:
--   - audit_logs_insert_member: メンバーなら誰でも、自分の大会の監査ログに行を足せた（偽の操作記録を作れる）
--   - log_audit_event(): ログイン済みなら誰でも実行でき、p_project_id を確認しないので、他の大会にも書けた。
--     ブラウザからも Edge Function からも使われていない
--   - authenticated に INSERT / TRUNCATE / TRIGGER / REFERENCES が付いていた（Data API は SELECT/INSERT/UPDATE/DELETE だけを
--     公開するが、不要な権限は持たせない）
--
-- 変更後:
--   - 書き込みは SECURITY DEFINER の関数（log_service_event, release_question_scorer, reset_project_data）と service_role だけ
--   - 読み取りは従来どおり（audit_logs_select_admin: 所有者・管理者）
--
-- ロールバック: 下の drop / revoke の逆を実行する（ポリシーと関数の grant を戻す）。

drop policy if exists audit_logs_insert_member on public.audit_logs;

revoke insert, update, delete, truncate, references, trigger on public.audit_logs from anon, authenticated;
revoke all on public.audit_logs from public;

revoke all on function public.log_audit_event(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.log_audit_event(text, text, text, text, jsonb, jsonb) to service_role;
