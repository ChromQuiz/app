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

    const { data, error } = await supabase
      .rpc('cancel_entry_atomic', {
        p_project_id: projectId,
        p_email_hash: emailHash,
        p_disclosure_password_hash: disclosurePasswordHash,
      })
      .single();

    if (error) {
      const message = error.message || '';
      if (message.includes('Entry already checked in')) {
        return jsonResponse({ error: '当日受付済みのため、キャンセルできません。変更が必要な場合は運営へ連絡してください。' }, 409);
      }
      return jsonResponse({ error: 'メールアドレスまたはパスワードが正しくありません。' }, 404);
    }
    if (!data) return jsonResponse({ error: 'メールアドレスまたはパスワードが正しくありません。' }, 404);
    return jsonResponse({
      ok: true,
      canceledEntry: {
        id: data.canceled_entry_id,
        entryNumber: data.canceled_entry_number,
      },
      promotedEntry: data.promoted_entry_id ? {
        id: data.promoted_entry_id,
        entryNumber: data.promoted_entry_number,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Entry already checked in')) {
      return jsonResponse({ error: '当日受付済みのため、キャンセルできません。変更が必要な場合は運営へ連絡してください。' }, 409);
    }
    return jsonResponse({ error: message }, 500);
  }
});
