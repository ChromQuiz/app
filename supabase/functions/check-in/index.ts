import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { clientIp, clientIpHash, enforceIpRateLimit, RateLimitError } from '../_shared/rate_limit.ts';
import { hashCheckinCode, normalizeCheckinCode } from '../_shared/qr_token.ts';
import { logServiceEvent } from '../_shared/audit.ts';

type Role = 'owner' | 'admin' | 'scorer';

const DESK_ROLES: Role[] = ['owner', 'admin', 'scorer'];
// 受付番号を起点にする操作(手入力受付・取り消し)は運営限定。
// 受付卓は scorer が担当することがあり、その端末は参加者に向いているため
// (checkin.html は「参加者が画面に二次元コードをかざす」前提のレイアウト)、
// 番号だけで状態を書き換えられる経路をその端末に残さない。
const STAFF_ONLY_ROLES: Role[] = ['owner', 'admin'];

const ENTRY_COLUMNS = 'id, entry_number, affiliation, grade, status, checked_in';

async function authenticatedUserId(supabase: ReturnType<typeof createServiceClient>, req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required');

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Authentication required');
  return userData.user.id as string;
}

async function requireProjectMember(
  supabase: ReturnType<typeof createServiceClient>,
  req: Request,
  projectId: string,
  allowedRoles: Role[],
) {
  const userId = await authenticatedUserId(supabase, req);

  const { data: member, error: memberError } = await supabase
    .from('project_members')
    .select('id, role, status')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  // V11: 除名直後に JWT が残っていても通さないよう、admin-* と同じ「active かつ想定ロール」を明示する。
  // (status <> 'removed' の否定形だと、将来 'suspended' 等が増えたときに素通りしてしまう)
  if (memberError || !member || member.status !== 'active') throw new Error('Forbidden');
  if (!allowedRoles.includes(member.role as Role)) throw new Error('Forbidden');
  return member;
}

function entryPayload(entry: Record<string, unknown>) {
  return {
    id: entry.id,
    entryNumber: entry.entry_number,
    affiliation: entry.affiliation,
    grade: entry.grade,
    status: entry.status,
    checkedIn: entry.checked_in,
  };
}

// 見つからない照会だけを IP 単位で制限する(受付番号の総当たり・列挙対策)。
// 正常な受付はカウントしないので、当日の連続受付は制限にかからない。
// (二次元コード が全滅して全員を手入力で捌く事態でも詰まらないよう、成功側には制限を置かない)
type EntryKey = { tokenHash: string } | { entryNumber: number };

async function selectEntry(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  by: EntryKey,
) {
  let query = supabase.from('entries').select(ENTRY_COLUMNS).eq('project_id', projectId);
  query = 'tokenHash' in by ? query.eq('checkin_token_hash', by.tokenHash) : query.eq('entry_number', by.entryNumber);

  const { data: entry, error } = await query.single();
  return error || !entry ? null : entry;
}

// 「見つからない」の数えは、権限を確認できた呼び出しだけが行う(権限のない呼び出しが回数を使い切らせない)。
async function countMiss(supabase: ReturnType<typeof createServiceClient>, req: Request, projectId: string) {
  await enforceIpRateLimit(supabase, { bucket: 'checkin_miss', ip: clientIp(req), projectId });
}

async function findEntry(
  supabase: ReturnType<typeof createServiceClient>,
  req: Request,
  projectId: string,
  by: EntryKey,
) {
  const entry = await selectEntry(supabase, projectId, by);
  if (!entry) await countMiss(supabase, req, projectId);
  return entry;
}

// 応答を返したあとで走らせる(監査ログのように、結果の表示を待たせたくない書き込み用)。
// 実行基盤に waitUntil が無いとき(ローカル・テスト)は、その場で待つ。
async function runAfterResponse(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const safe = task.catch((error) => console.error('[check-in] background task failed', error instanceof Error ? error.message : String(error)));
  if (runtime?.waitUntil) runtime.waitUntil(safe);
  else await safe;
}

function parseEntryNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'この方法ではアクセスできません。' }, 405);

  try {
    const { action, projectId, qr, entryNumber, confirmedEntryId } = await req.json();
    if (!projectId || !action) return jsonResponse({ error: '受付のリクエスト情報が不足しています。ページを開き直してください。' }, 400);

    const supabase = createServiceClient();

    if (action === 'stats') {
      await requireProjectMember(supabase, req, projectId, DESK_ROLES);
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
        stats: { total, checked, remaining: total - checked },
      });
    }

    // (a) 二次元コード 受付: 受付コード(V8・20 文字)のみ。素の entry UUID も旧形式も受付番号も受け付けない。
    // コードは形を整えてから sha256 にし、project_id とハッシュで引く。見つからない照会は checkin_miss に数える(総当たり対策)。
    if (action === 'check') {
      // Auth の確認のあと、権限・照会・更新・監査ログを check_in_by_code(SQL 関数)の1回で行う。
      // 権限がなければ、形のエラーも照会の結果も返さず、「見つからない」の数えにも入れない。
      const startedAt = performance.now();
      const userId = await authenticatedUserId(supabase, req);
      const authMs = performance.now() - startedAt;

      const scanned = qr;
      if (scanned === undefined || scanned === null || String(scanned).length === 0) {
        await requireProjectMember(supabase, req, projectId, DESK_ROLES);
        return jsonResponse({ error: '二次元コードが必要です。' }, 400);
      }
      const code = normalizeCheckinCode(scanned);
      if (!code) {
        await requireProjectMember(supabase, req, projectId, DESK_ROLES);
        return jsonResponse({
          error: 'この二次元コードは使用できません。マイエントリーで最新の二次元コードを表示するか、運営に伝えてください。',
        }, 400);
      }

      const [tokenHash, actorIpHash] = await Promise.all([hashCheckinCode(code), clientIpHash(req)]);
      const rpcStartedAt = performance.now();
      const { data, error } = await supabase.rpc('check_in_by_code', {
        p_project_id: projectId,
        p_user_id: userId,
        p_token_hash: tokenHash,
        p_actor_ip_hash: actorIpHash || null,
      });
      if (error) throw error;
      const dbMs = performance.now() - rpcStartedAt;

      // 時間の内訳(ブラウザの開発者ツールのタイミング欄に出る。時間だけで、中身は含まない)。
      const withTiming = (response: Response) => {
        response.headers.set('server-timing', `auth;dur=${authMs.toFixed(0)}, db;dur=${dbMs.toFixed(0)}, total;dur=${(performance.now() - startedAt).toFixed(0)}`);
        return response;
      };

      const result = String(data?.result || '');
      if (result === 'forbidden') throw new Error('Forbidden');
      if (result === 'not_found') {
        await countMiss(supabase, req, projectId);
        return jsonResponse({ error: '該当者が見つかりません。' }, 404);
      }
      if (result === 'conflict') {
        return jsonResponse({ error: '受付対象外になりました。最新の状態を確認してください。' }, 409);
      }
      if (['success', 'already', 'canceled', 'waitlist'].includes(result) && data.entry) {
        return withTiming(jsonResponse({ ok: true, result, entry: entryPayload(data.entry) }));
      }
      throw new Error('check_in_by_code returned an unexpected result');
    }

    // (b) 手入力での照会: 状態を一切変えない。運営が氏名・所属を目視確認するための第一段階。
    if (action === 'lookup') {
      await requireProjectMember(supabase, req, projectId, STAFF_ONLY_ROLES);
      const num = parseEntryNumber(entryNumber);
      if (num === null) return jsonResponse({ error: '受付番号が必要です。' }, 400);

      const entry = await findEntry(supabase, req, projectId, { entryNumber: num });
      if (!entry) return jsonResponse({ error: '該当者が見つかりません。' }, 404);
      return jsonResponse({ ok: true, entry: entryPayload(entry) });
    }

    // (c) 手入力での受付確定 / (d) 受付の取り消し。
    // 受付番号は公開情報(public_entry_list が anon に entry_number と checked_in を出している)ため、
    // 「番号を知っていること」は認証材料にならない。運営が lookup で氏名・所属を目視確認し、
    // そこで得た id を confirmedEntryId として送り返すことを必須にする。
    // 打ち間違いで別人を受付済みにする事故の防止も兼ねる。
    if (action === 'check_manual' || action === 'undo') {
      const member = await requireProjectMember(supabase, req, projectId, STAFF_ONLY_ROLES);
      const num = parseEntryNumber(entryNumber);
      if (num === null) return jsonResponse({ error: '受付番号が必要です。' }, 400);
      if (!confirmedEntryId) {
        return jsonResponse({ error: '確認手順を経ていません。もう一度照会からやり直してください。' }, 400);
      }

      const entry = await findEntry(supabase, req, projectId, { entryNumber: num });
      if (!entry) return jsonResponse({ error: '該当者が見つかりません。' }, 404);
      // 照会後に名簿が変わった場合(番号の付け替え等)は確定させない。
      if (String(entry.id) !== String(confirmedEntryId)) {
        return jsonResponse({ error: '照会した内容と一致しません。もう一度照会からやり直してください。' }, 409);
      }

      if (action === 'undo') {
        return await commitUndo(supabase, req, projectId, entry, member?.id ?? null);
      }
      return await commitCheckIn(supabase, req, projectId, entry, member?.id ?? null);
    }

    return jsonResponse({ error: 'この操作は受け付けられません。ページを開き直してください。' }, 400);
  } catch (error) {
    if (error instanceof RateLimitError) return jsonResponse({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') {
      return jsonResponse({ error: 'この大会の受付を操作する権限がありません。Googleアカウントと大会を確認してください。' }, 403);
    }
    if (message === 'Authentication required') {
      return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    }
    return serverErrorResponse(error, 'check-in');
  }
}));

async function commitCheckIn(
  supabase: ReturnType<typeof createServiceClient>,
  req: Request,
  projectId: string,
  entry: Record<string, unknown>,
  actorMemberId: string | null,
) {
  if (entry.status === 'canceled') {
    return jsonResponse({ ok: true, result: 'canceled', entry: entryPayload(entry) });
  }
  if (entry.status === 'waitlist') {
    return jsonResponse({ ok: true, result: 'waitlist', entry: entryPayload(entry) });
  }
  if (entry.checked_in) {
    return jsonResponse({ ok: true, result: 'already', entry: entryPayload(entry) });
  }

  const { data: updated, error: updateError } = await supabase
    .from('entries')
    .update({ checked_in: true })
    .eq('id', entry.id)
    .eq('checked_in', false)
    .in('status', ['registered', 'late'])
    .select(ENTRY_COLUMNS)
    .single();
  if (updateError || !updated) {
    return jsonResponse({ error: '受付対象外になりました。最新の状態を確認してください。' }, 409);
  }

  // 監査ログは結果の表示を待たせない(logServiceEvent は失敗しても例外を出さない fail-open のまま)。
  await runAfterResponse((async () => logServiceEvent(supabase, {
    projectId,
    action: 'entry.checkin',
    targetId: String(updated.id),
    actorKind: 'staff',
    actorMemberId: actorMemberId ? String(actorMemberId) : null,
    actorIpHash: await clientIpHash(req),
    afterData: { checked_in: true },
  }))());

  return jsonResponse({ ok: true, result: 'success', entry: entryPayload(updated) });
}

// 受付の取り消し。打ち間違いや誤操作を当日中に戻せるようにするための運営操作で、
// 誰が戻したかを必ず監査ログに残す(受付済みフラグを消す唯一の経路)。
async function commitUndo(
  supabase: ReturnType<typeof createServiceClient>,
  req: Request,
  projectId: string,
  entry: Record<string, unknown>,
  actorMemberId: string | null,
) {
  if (!entry.checked_in) {
    return jsonResponse({ ok: true, result: 'not_checked_in', entry: entryPayload(entry) });
  }

  const { data: updated, error: updateError } = await supabase
    .from('entries')
    .update({ checked_in: false })
    .eq('id', entry.id)
    .eq('checked_in', true)
    .select(ENTRY_COLUMNS)
    .single();
  if (updateError || !updated) {
    return jsonResponse({ error: '取り消しできませんでした。最新の状態を確認してください。' }, 409);
  }

  await logServiceEvent(supabase, {
    projectId,
    action: 'entry.checkin.undo',
    targetId: String(updated.id),
    actorKind: 'staff',
    actorMemberId: actorMemberId ? String(actorMemberId) : null,
    actorIpHash: await clientIpHash(req),
    afterData: { checked_in: false },
  });

  return jsonResponse({ ok: true, result: 'undone', entry: entryPayload(updated) });
}
