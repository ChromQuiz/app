import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { clientIpHash } from '../_shared/rate_limit.ts';
import { verifyQrToken } from '../_shared/qr_token.ts';
import { logServiceEvent } from '../_shared/audit.ts';

async function requireProjectMember(supabase: ReturnType<typeof createServiceClient>, req: Request, projectId: string) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required');

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Authentication required');

  const { data: member, error: memberError } = await supabase
    .from('project_members')
    .select('id, role, status')
    .eq('project_id', projectId)
    .eq('user_id', userData.user.id)
    .single();
  // V11: 除名直後に JWT が残っていても通さないよう、admin-* と同じ「active かつ想定ロール」を明示する。
  // (status <> 'removed' の否定形だと、将来 'suspended' 等が増えたときに素通りしてしまう)
  if (memberError || !member || member.status !== 'active') throw new Error('Forbidden');
  if (member.role !== 'owner' && member.role !== 'admin' && member.role !== 'scorer') {
    throw new Error('Forbidden');
  }
  return member;
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { action, projectId, entryId, qr, entryNumber } = await req.json();
    if (!projectId || !action) return jsonResponse({ error: '当日受付のリクエスト情報が不足しています。ページを開き直してください。' }, 400);

    const supabase = createServiceClient();
    const member = await requireProjectMember(supabase, req, projectId);

    if (action === 'stats') {
      const { data: entries, error } = await supabase
        .from('entries')
        .select('checked_in, status')
        .eq('project_id', projectId)
        .in('status', ['registered', 'late']);
      if (error) throw error;
      const total = entries?.length || 0;
      const checked = (entries || []).filter((entry) => entry.checked_in).length;
      return jsonResponse({
        ok: true,
        stats: {
          total,
          checked,
          remaining: total - checked,
        },
      });
    }

    if (action !== 'check') {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    // 受付の識別方法は2つ:
    //  (a) QR: 署名付きトークン(V7)。素の entry UUID は受け付けない(改ざん・なりすまし防止)。
    //  (b) 受付番号: 運営が本人の受付番号を目視照合して手入力する運用フォールバック。
    // 旧形式(素のUUID)の QR は verifyQrToken が null を返すため 400 になる。
    let query = supabase
      .from('entries')
      .select('id, entry_number, entry_name, affiliation, grade, status, checked_in')
      .eq('project_id', projectId);

    const scanned = qr ?? entryId;   // entryId は後方互換の受け口(中身は署名付きトークン)
    if (scanned !== undefined && scanned !== null && String(scanned).length > 0) {
      const verifiedId = await verifyQrToken(scanned);
      if (!verifiedId) {
        return jsonResponse({
          error: 'このQRコードは使用できません。マイエントリーで最新のQRコードを表示するか、受付番号で受付してください。',
        }, 400);
      }
      query = query.eq('id', verifiedId);
    } else if (Number.isFinite(Number(entryNumber)) && Number(entryNumber) > 0) {
      query = query.eq('entry_number', Number(entryNumber));
    } else {
      return jsonResponse({ error: 'QRコードまたは受付番号が必要です。' }, 400);
    }

    const { data: entry, error: entryError } = await query.single();
    if (entryError || !entry) return jsonResponse({ error: '該当者が見つかりません。' }, 404);

    const entryPayload = {
      id: entry.id,
      entryNumber: entry.entry_number,
      entryName: entry.entry_name,
      affiliation: entry.affiliation,
      grade: entry.grade,
      status: entry.status,
      checkedIn: entry.checked_in,
    };

    if (entry.status === 'canceled') {
      return jsonResponse({ ok: true, result: 'canceled', entry: entryPayload });
    }
    if (entry.status === 'waitlist') {
      return jsonResponse({ ok: true, result: 'waitlist', entry: entryPayload });
    }
    if (entry.checked_in) {
      return jsonResponse({ ok: true, result: 'already', entry: entryPayload });
    }

    const { data: updated, error: updateError } = await supabase
      .from('entries')
      .update({ checked_in: true })
      .eq('id', entry.id)
      .eq('checked_in', false)
      .in('status', ['registered', 'late'])
      .select('id, entry_number, entry_name, affiliation, grade, status, checked_in')
      .single();
    if (updateError || !updated) {
      return jsonResponse({ error: '受付対象外になりました。最新の状態を確認してください。' }, 409);
    }

    await logServiceEvent(supabase, {
      projectId,
      action: 'entry.checkin',
      targetId: String(updated.id),
      actorKind: 'staff',
      actorMemberId: member?.id ? String(member.id) : null,
      actorIpHash: await clientIpHash(req),
      afterData: { checked_in: true },
    });

    return jsonResponse({
      ok: true,
      result: 'success',
      entry: {
        id: updated.id,
        entryNumber: updated.entry_number,
        entryName: updated.entry_name,
        affiliation: updated.affiliation,
        grade: updated.grade,
        status: updated.status,
        checkedIn: updated.checked_in,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') {
      return jsonResponse({ error: 'このプロジェクトの当日受付を操作する権限がありません。Googleアカウントとプロジェクトを確認してください。' }, 403);
    }
    if (message === 'Authentication required') {
      return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    }
    return serverErrorResponse(error, 'check-in');
  }
}));
