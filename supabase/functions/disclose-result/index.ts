import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';

type EntryRow = {
  id: string;
  entry_number: number;
  entry_name: string | null;
  affiliation: string | null;
  grade: string | null;
};

type FinalResultRow = {
  entry_id: string;
  question_number: number;
  result: string;
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function streaksFromAnswers(answers: number[]): number[] {
  const streaks: number[] = [];
  let current = 0;
  for (const answer of answers) {
    if (answer === 1) {
      current += 1;
    } else {
      streaks.push(current);
      current = 0;
    }
  }
  streaks.push(current);
  return streaks;
}

function compareRank(a: { score: number; streaks: number[] }, b: { score: number; streaks: number[] }): number {
  if (b.score !== a.score) return b.score - a.score;
  const maxLen = Math.max(a.streaks.length, b.streaks.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = a.streaks[i] || 0;
    const bv = b.streaks[i] || 0;
    if (bv !== av) return bv - av;
  }
  return 0;
}

function sameRankKey(a: { score: number; streaks: number[] }, b: { score: number; streaks: number[] }): boolean {
  return a.score === b.score && JSON.stringify(a.streaks) === JSON.stringify(b.streaks);
}

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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, disclosure_enabled, disclosure_period_start, disclosure_period_end, question_count')
      .eq('id', projectId)
      .single();
    if (projectError || !project) return jsonResponse({ error: 'Project not found' }, 404);
    if (!project.disclosure_enabled) return jsonResponse({ error: 'Disclosure is closed' }, 403);
    const now = Date.now();
    if (project.disclosure_period_start && new Date(project.disclosure_period_start).getTime() > now) {
      return jsonResponse({ error: 'Disclosure has not started' }, 403);
    }
    if (project.disclosure_period_end && new Date(project.disclosure_period_end).getTime() < now) {
      return jsonResponse({ error: 'Disclosure has ended' }, 403);
    }

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id, entry_number, entry_name, affiliation, grade')
      .eq('project_id', projectId)
      .eq('email_hash', emailHash)
      .eq('disclosure_password_hash', disclosurePasswordHash)
      .single();
    if (entryError || !entry) return jsonResponse({ error: 'Entry not found' }, 404);

    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('id, entry_number, entry_name, affiliation, grade')
      .eq('project_id', projectId)
      .in('status', ['registered', 'late'])
      .order('entry_number', { ascending: true });
    if (entriesError) throw entriesError;

    const { data: allResults, error: allResultsError } = await supabase
      .from('final_results')
      .select('entry_id, question_number, result')
      .eq('project_id', projectId)
      .order('question_number', { ascending: true });
    if (allResultsError) throw allResultsError;

    const resultsByEntry = new Map<string, Map<number, string>>();
    for (const result of (allResults || []) as FinalResultRow[]) {
      if (!resultsByEntry.has(result.entry_id)) {
        resultsByEntry.set(result.entry_id, new Map());
      }
      resultsByEntry.get(result.entry_id)?.set(result.question_number, result.result);
    }

    const ranked = ((entries || []) as EntryRow[]).map((entryRow) => {
      const entryResults = resultsByEntry.get(entryRow.id) || new Map<number, string>();
      const answers: number[] = [];
      for (let q = 1; q <= project.question_count; q += 1) {
        answers.push(entryResults.get(q) === 'correct' ? 1 : 0);
      }
      const score = answers.reduce((sum, answer) => sum + answer, 0);
      const streaks = streaksFromAnswers(answers);
      return { entry: entryRow, score, streaks, answers, rank: 0 };
    }).sort(compareRank);

    let currentRank = 1;
    for (let i = 0; i < ranked.length; i += 1) {
      if (i > 0 && !sameRankKey(ranked[i - 1], ranked[i])) {
        currentRank = i + 1;
      }
      ranked[i].rank = currentRank;
    }

    const own = ranked.find((row) => row.entry.id === entry.id);
    if (!own) return jsonResponse({ error: 'Entry is not eligible for disclosure' }, 404);

    return jsonResponse({
      ok: true,
      displayName: entry.entry_name,
      rank: ordinal(own.rank),
      rankNumber: own.rank,
      score: own.score,
      streaks: own.streaks,
      totalQuestions: project.question_count,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
