import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ParticipantAuthError, resolveParticipantAuth } from '../_shared/participant_auth.ts';

type PublicProfile = {
  entryName?: string;
  affiliation?: string;
  grade?: string;
  message?: string;
  inquiry?: string;
  isChubu?: boolean;
};

function isEntryEditOpen(project: {
  entry_open: boolean;
  period_start: string | null;
  period_end: string | null;
}) {
  if (project.entry_open !== true) return false;
  const now = Date.now();
  if (project.period_start && new Date(project.period_start).getTime() > now) return false;
  if (project.period_end && new Date(project.period_end).getTime() < now) return false;
  return true;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const {
      projectId,
      encryptedPii,
      publicProfile,
    }: {
      projectId?: string;
      encryptedPii?: string;
      publicProfile?: PublicProfile;
    } = body;

    if (!projectId) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const supabase = createServiceClient();
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('entry_open, period_start, period_end')
      .eq('id', projectId)
      .single();
    if (projectError || !project) return jsonResponse({ error: 'Project not found' }, 404);
    if (!isEntryEditOpen(project)) {
      return jsonResponse({ error: '現在エントリー内容の編集はできません。' }, 403);
    }

    const { entry } = await resolveParticipantAuth(
      supabase,
      body,
      'id, entry_number, entry_name, affiliation, grade, message, inquiry, is_chubu, status, checked_in',
    );

    if (entry.status === 'canceled') {
      return jsonResponse({ error: 'このエントリーはキャンセルされています。' }, 409);
    }
    if (entry.checked_in) {
      return jsonResponse({ error: '当日受付済みのため、エントリー内容は編集できません。変更が必要な場合は運営へ連絡してください。' }, 409);
    }

    if (!encryptedPii) {
      return jsonResponse({
        ok: true,
        entry: {
          id: entry.id,
          entryNumber: entry.entry_number,
          entryName: entry.entry_name,
          affiliation: entry.affiliation,
          grade: entry.grade,
          message: entry.message,
          inquiry: entry.inquiry,
          isChubu: entry.is_chubu,
          status: entry.status,
        },
      });
    }

    const profile = publicProfile || {};
    const { data: updated, error: updateError } = await supabase
      .from('entries')
      .update({
        encrypted_pii: encryptedPii,
        entry_name: profile.entryName || null,
        affiliation: profile.affiliation || null,
        grade: profile.grade || null,
        message: profile.message || null,
        inquiry: profile.inquiry || null,
        is_chubu: Boolean(profile.isChubu),
      })
      .eq('id', entry.id)
      .neq('status', 'canceled')
      .eq('checked_in', false)
      .select('id, entry_number, status')
      .single();

    if (updateError || !updated) {
      return jsonResponse({ error: 'エントリーを更新できませんでした。' }, 500);
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
