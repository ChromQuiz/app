import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { projectId, emailHash, disclosurePasswordHash } = await req.json();
    if (!projectId || !emailHash || !disclosurePasswordHash) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('entries')
      .update({ status: 'canceled' })
      .eq('project_id', projectId)
      .eq('email_hash', emailHash)
      .eq('disclosure_password_hash', disclosurePasswordHash)
      .neq('status', 'canceled')
      .select('id, entry_number, status')
      .single();

    if (error || !data) return jsonResponse({ error: 'Entry not found' }, 404);
    return jsonResponse({ ok: true, entry: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
