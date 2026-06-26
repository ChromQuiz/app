import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { sendSesEmail } from '../_shared/ses.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const internalSecret = Deno.env.get('CIQ_EDGE_INTERNAL_SECRET');
    if (!internalSecret || req.headers.get('x-ciq-internal-secret') !== internalSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { projectId, entryId, recipientHash, to, subject, html, text, replyTo, template } = await req.json();
    if (!projectId || !recipientHash || !to || !subject || !html || !template) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: queued, error: queueError } = await supabase
      .from('email_events')
      .insert({
        project_id: projectId,
        entry_id: entryId || null,
        recipient_hash: recipientHash,
        template,
        provider: 'ses',
        status: 'queued',
      })
      .select('id')
      .single();

    if (queueError) throw queueError;

    const sesResult = await sendSesEmail({ to, subject, html, text, replyTo });
    const providerMessageId = sesResult?.MessageId || null;

    await supabase
      .from('email_events')
      .update({
        status: 'sent',
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', queued.id);

    return jsonResponse({ ok: true, id: queued.id, providerMessageId });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
