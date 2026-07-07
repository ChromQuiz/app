// my-entry — マイエントリー(my.html)のハブAPI
//
// 認証(emailHash+パスワードハッシュ または 短命トークン)に成功すると、
//   - エントリーサマリー(公開プロフィール + 状態)
//   - 当日受付QRの署名付き画像URL(メールと同一データ・同一署名)
//   - スライド延長された新しいセッショントークン
// を返す。パスワードや復号PIIは返さない・保存しない。

import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import {
  ParticipantAuthError,
  issueParticipantToken,
  resolveParticipantAuth,
} from '../_shared/participant_auth.ts';
import { makeQrSvg } from '../_shared/qr.ts';

const ENTRY_COLUMNS = [
  'id',
  'entry_number',
  'status',
  'checked_in',
  'entry_name',
  'affiliation',
  'grade',
  'message',
  'inquiry',
  'is_chubu',
  'created_at',
].join(', ');

function isWithinPeriod(start: string | null, end: string | null) {
  const now = Date.now();
  if (start && new Date(start).getTime() > now) return false;
  if (end && new Date(end).getTime() < now) return false;
  return true;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const projectId = String(body.projectId || '');
    if (!projectId) return jsonResponse({ error: 'プロジェクト情報が見つかりません。メール内のリンクから開き直してください。' }, 400);

    const supabase = createServiceClient();
    const { entry, emailHash } = await resolveParticipantAuth(supabase, body, ENTRY_COLUMNS);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('name, entry_open, period_start, period_end, disclosure_enabled, disclosure_period_start, disclosure_period_end')
      .eq('id', projectId)
      .single();
    if (projectError || !project) return jsonResponse({ error: 'Project not found' }, 404);

    const entryId = String(entry.id);
    const status = String(entry.status || '');
    const checkedIn = entry.checked_in === true;

    // キャンセル済みでもサマリーは返す(状態を本人が確認できることが目的)。
    // 操作可否はクライアント表示 + 各Edge Functionの再検証で二重に守る。
    const editable = !checkedIn
      && (status === 'registered' || status === 'waitlist')
      && project.entry_open === true
      && isWithinPeriod(project.period_start, project.period_end);

    const canMarkLate = !checkedIn && status === 'registered';
    const cancellable = !checkedIn && status !== 'canceled';

    const disclosureOpen = project.disclosure_enabled === true
      && isWithinPeriod(project.disclosure_period_start, project.disclosure_period_end);

    // 当日受付QR — メール(send-email)と同一データ(entry.id)なので受付側でそのまま読める。
    // キャンセル済みのQRは受付で弾かれるため返さない。
    const qrSvg = status === 'canceled' ? '' : await makeQrSvg(entryId);

    const { token, expiresAt } = await issueParticipantToken({ projectId, entryId, emailHash });

    return jsonResponse({
      ok: true,
      token,
      tokenExpiresAt: expiresAt,
      projectName: project.name || projectId,
      qrSvg,
      capabilities: { editable, canMarkLate, cancellable, disclosureOpen },
      entry: {
        id: entryId,
        entryNumber: entry.entry_number,
        status,
        checkedIn,
        entryName: entry.entry_name,
        affiliation: entry.affiliation,
        grade: entry.grade,
        message: entry.message,
        inquiry: entry.inquiry,
        isChubu: entry.is_chubu === true,
      },
    });
  } catch (error) {
    if (error instanceof ParticipantAuthError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
