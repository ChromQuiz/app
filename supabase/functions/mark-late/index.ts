import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { projectId, emailHash, disclosurePasswordHash } = await req.json();
    if (!projectId || !emailHash || !disclosurePasswordHash) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const supabase = createServiceClient();
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id, entry_number, status')
      .eq('project_id', projectId)
      .eq('email_hash', emailHash)
      .eq('disclosure_password_hash', disclosurePasswordHash)
      .single();

    if (entryError || !entry) {
      return jsonResponse({ error: 'メールアドレスまたはパスワードが正しくありません。' }, 404);
    }
    if (entry.status === 'late') {
      return jsonResponse({ error: '既に遅刻が届け出済みです。' }, 409);
    }
    if (entry.status !== 'registered') {
      return jsonResponse({ error: 'このエントリーは遅刻届け出の対象ではありません。' }, 409);
    }

    const { data: updated, error: updateError } = await supabase
      .from('entries')
      .update({ status: 'late' })
      .eq('id', entry.id)
      .eq('status', 'registered')
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
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
