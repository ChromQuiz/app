import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ParticipantAuthError, resolveParticipantAuth } from '../_shared/participant_auth.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { projectId } = body;
    if (!projectId) {
      return jsonResponse({ error: 'プロジェクト情報が見つかりません。メール内のリンクから開き直してください。' }, 400);
    }

    const supabase = createServiceClient();
    const { entry } = await resolveParticipantAuth(
      supabase,
      body,
      'id, entry_number, status, checked_in',
    );

    if (entry.status === 'late') {
      return jsonResponse({ error: '既に遅刻が届け出済みです。' }, 409);
    }
    if (entry.checked_in) {
      return jsonResponse({ error: '当日受付済みのため、遅刻届け出はできません。変更が必要な場合は運営へ連絡してください。' }, 409);
    }
    if (entry.status !== 'registered') {
      return jsonResponse({ error: 'このエントリーは遅刻届け出の対象ではありません。' }, 409);
    }

    const { data: updated, error: updateError } = await supabase
      .from('entries')
      .update({ status: 'late' })
      .eq('id', entry.id)
      .eq('status', 'registered')
      .eq('checked_in', false)
      .select('id, entry_number, status')
      .single();

    if (updateError || !updated) {
      return jsonResponse({ error: '遅刻届け出を保存できませんでした。' }, 500);
    }

    return jsonResponse({
      ok: true,
      entry: {
        id: updated.id,
        entryNumber: updated.entry_number,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof ParticipantAuthError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
