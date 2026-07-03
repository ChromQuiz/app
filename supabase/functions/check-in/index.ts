import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

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
  if (memberError || !member || member.status === 'removed') throw new Error('Forbidden');
  return member;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { action, projectId, entryId } = await req.json();
    if (!projectId || !action) return jsonResponse({ error: 'Missing required fields' }, 400);

    const supabase = createServiceClient();
    await requireProjectMember(supabase, req, projectId);

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

    if (action !== 'check' || !entryId) {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id, entry_number, entry_name, affiliation, grade, status, checked_in')
      .eq('project_id', projectId)
      .eq('id', entryId)
      .single();
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
    const status = message === 'Forbidden' ? 403 : message === 'Authentication required' ? 401 : 500;
    const publicMessage = message === 'Forbidden'
      ? 'このプロジェクトの当日受付を操作する権限がありません。Googleアカウントとプロジェクトを確認してください。'
      : message === 'Authentication required'
        ? 'Googleログインが必要です。'
        : message;
    return jsonResponse({ error: publicMessage }, status);
  }
});
