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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, disclosure_enabled, question_count')
      .eq('id', projectId)
      .single();
    if (projectError || !project) return jsonResponse({ error: 'Project not found' }, 404);
    if (!project.disclosure_enabled) return jsonResponse({ error: 'Disclosure is closed' }, 403);

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id, entry_number, entry_name, affiliation, grade')
      .eq('project_id', projectId)
      .eq('email_hash', emailHash)
      .eq('disclosure_password_hash', disclosurePasswordHash)
      .single();
    if (entryError || !entry) return jsonResponse({ error: 'Entry not found' }, 404);

    const { data: results, error: resultsError } = await supabase
      .from('final_results')
      .select('question_number, result')
      .eq('project_id', projectId)
      .eq('entry_id', entry.id)
      .order('question_number', { ascending: true });
    if (resultsError) throw resultsError;

    const correctCount = (results || []).filter((r) => r.result === 'correct').length;
    return jsonResponse({
      ok: true,
      entry: {
        entryNumber: entry.entry_number,
        entryName: entry.entry_name,
        affiliation: entry.affiliation,
        grade: entry.grade,
      },
      score: correctCount,
      totalQuestions: project.question_count,
      results,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
