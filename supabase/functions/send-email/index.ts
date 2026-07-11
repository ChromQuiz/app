import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { emailProviderName, sendProviderEmail } from '../_shared/email_provider.ts';
import { hmacHex, safeEqual, signingSecret, SigningConfigError } from '../_shared/signing.ts';
import { clientIp, enforceIpRateLimit, RateLimitError } from '../_shared/rate_limit.ts';

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

const encoder = new TextEncoder();

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function projectName(data: Record<string, unknown>) {
  return String(data.projectName || 'CIQ');
}

async function signedQrUrl(value: string) {
  if (!value) return '';
  const signature = await hmacHex(signingSecret(), value);
  const baseUrl = Deno.env.get('SUPABASE_URL') || '';
  if (!baseUrl) return '';
  const url = new URL('/functions/v1/checkin-qr', baseUrl);
  url.searchParams.set('d', value);
  url.searchParams.set('s', signature);
  return url.href;
}

/* ------------------------------------------------------------
 * HTMLメール — サイト側UIに寄せた静かな白黒グレー基調。
 * メールクライアント互換のため table + inline CSS のみを使用する。
 * ------------------------------------------------------------ */
const MAIL_FONT = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Hiragino Sans',Meiryo,sans-serif";
const MAIL_MONO = "'SF Mono','SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
const MAIL = {
  canvas: '#f5f5f7',
  paper: '#f5f5f7',
  surface: '#ffffff',
  surface2: '#f5f5f7',
  text: '#1d1d1f',
  sub: '#6e6e73',
  muted: '#86868b',
  border: '#e5e5ea',
  borderStrong: '#d2d2d7',
  accent: '#1d1d1f',
  accentInk: '#ffffff',
  blue: '#0066cc',
};

function shell(title: string, subtitle: string, body: string) {
  return `
  <style>
    @media screen and (max-width: 560px) {
      .ciq-mail-canvas { padding: 20px 10px !important; }
      .ciq-mail-card { padding: 22px 18px !important; }
      .ciq-mail-button-cell { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
    }
  </style>
  <table class="ciq-mail-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${MAIL.canvas};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
          <tr>
            <td style="font-family:${MAIL_FONT};color:${MAIL.text};font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;padding:0 2px 8px;text-align:center;" align="center">
              ${escapeHtml(subtitle)}
            </td>
          </tr>
          <tr>
            <td style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:14px;line-height:1.6;font-weight:600;padding:0 2px 24px;text-align:center;" align="center">
              ${escapeHtml(title)}
            </td>
          </tr>
          <tr>
            <td class="ciq-mail-card" style="background:${MAIL.surface};border:1px solid ${MAIL.border};border-radius:20px;padding:30px;font-family:${MAIL_FONT};color:${MAIL.text};font-size:15px;line-height:1.75;text-align:left;" align="left">${body}</td>
          </tr>
          <tr>
            <td style="font-family:${MAIL_FONT};text-align:center;font-size:12px;line-height:1.7;color:${MAIL.muted};padding:22px 8px 0;">
              Powered by CIQ<br>このメールは自動送信されています。
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

function panel(body: string, tone = 'info') {
  const labels: Record<string, string> = {
    info: '確認',
    success: '完了',
    warning: '注意',
    danger: '重要',
  };
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
      <td style="border:1px solid ${MAIL.border};border-left:3px solid ${tone === 'success' ? '#248a3d' : tone === 'warning' ? '#bf6a02' : tone === 'danger' ? '#d70015' : MAIL.borderStrong};border-radius:16px;background:${MAIL.surface};padding:14px 16px;font-family:${MAIL_FONT};color:${MAIL.text};font-size:14px;line-height:1.75;">
        <div style="font-size:12px;font-weight:800;color:${MAIL.sub};margin-bottom:4px;">${escapeHtml(labels[tone] || labels.info)}</div>
        <div style="font-weight:600;">${body}</div>
      </td>
    </tr>
  </table>
  `;
}

function detailsTable(rows: Array<[string, unknown]>) {
  const last = rows.length - 1;
  const tableRows = rows.map(([label, value], i) => `
    <tr>
      <td style="padding:12px 14px;font-family:${MAIL_FONT};font-size:13px;font-weight:700;color:${MAIL.sub};${i === last ? '' : `border-bottom:1px solid ${MAIL.border};`}">${escapeHtml(label)}</td>
      <td align="right" style="padding:12px 14px;font-family:${MAIL_MONO};font-size:14px;font-weight:700;color:${MAIL.text};letter-spacing:.02em;${i === last ? '' : `border-bottom:1px solid ${MAIL.border};`}">${escapeHtml(value)}</td>
    </tr>
  `).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${MAIL.border};border-radius:16px;margin:16px 0;background:${MAIL.surface};">
    ${tableRows}
  </table>
  `;
}

function numberCard(label: string, value: string) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
      <td align="center" style="border:1px solid ${MAIL.border};border-radius:18px;padding:20px;background:${MAIL.surface2};">
        <div style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:12px;font-weight:800;margin-bottom:4px;">${escapeHtml(label)}</div>
        <div style="font-family:${MAIL_MONO};color:${MAIL.text};font-size:36px;font-weight:800;letter-spacing:.04em;line-height:1.1;">${escapeHtml(value)}</div>
      </td>
    </tr>
  </table>
  `;
}

function qrCard(qrImageUrl: string) {
  if (!qrImageUrl) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
      <td align="center" style="border:1px solid ${MAIL.border};border-radius:18px;padding:20px;background:${MAIL.surface};">
        <img src="${escapeHtml(qrImageUrl)}" alt="当日受付用QRコード" width="176" height="176" style="display:block;margin:0 auto;border:0;">
        <div style="font-family:${MAIL_FONT};color:${MAIL.text};font-size:13px;font-weight:800;margin-top:12px;">当日受付用QRコード</div>
        <div style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:12px;margin-top:2px;">当日受付で提示してください。</div>
      </td>
    </tr>
  </table>
  `;
}

function primaryButton(label: string, href: string) {
  if (!href) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
    <tr>
      <td align="center" style="background:${MAIL.accent};border:1px solid ${MAIL.accent};border-radius:999px;">
        <a href="${escapeHtml(href)}" style="display:block;color:${MAIL.accentInk};text-decoration:none;font-family:${MAIL_FONT};font-size:14px;font-weight:700;padding:13px 20px;border-radius:999px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>
  `;
}

function buttonPair(primaryLabel: string, primaryHref: string, secondaryLabel: string, secondaryHref: string) {
  const primary = primaryHref ? `
    <td class="ciq-mail-button-cell" width="50%" align="center" valign="top" style="width:50%;padding:0 6px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="background:${MAIL.accent};border:1px solid ${MAIL.accent};border-radius:999px;">
            <a href="${escapeHtml(primaryHref)}" style="display:block;color:${MAIL.accentInk};text-decoration:none;font-family:${MAIL_FONT};font-size:14px;font-weight:700;padding:13px 18px;border-radius:999px;">${escapeHtml(primaryLabel)}</a>
          </td>
        </tr>
      </table>
    </td>
  ` : '';
  const secondary = secondaryHref ? `
    <td class="ciq-mail-button-cell" width="50%" align="center" valign="top" style="width:50%;padding:0 0 0 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="background:${MAIL.surface};border:1px solid ${MAIL.borderStrong};border-radius:999px;">
            <a href="${escapeHtml(secondaryHref)}" style="display:block;color:${MAIL.text};text-decoration:none;font-family:${MAIL_FONT};font-size:14px;font-weight:700;padding:13px 18px;border-radius:999px;">${escapeHtml(secondaryLabel)}</a>
          </td>
        </tr>
      </table>
    </td>
  ` : '';
  if (!primary && !secondary) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;margin:18px 0;">
    <tr>${primary}${secondary}</tr>
  </table>
  `;
}

function entryConfirmation(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const status = data.status === 'waitlist' ? 'キャンセル待ち' : '登録完了';
  const password = String(data.password || '');
  const myUrl = String(data.myUrl || '');
  const entryListUrl = String(data.entryListUrl || '');
  const qrImageUrl = String(data.qrImageUrl || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  const waitlistNotice = data.status === 'waitlist'
    ? panel('現在はキャンセル待ちです。繰り上がった場合は別途メールでお知らせします。', 'warning')
    : panel('エントリーを受け付けました。', 'success');
  const body = `
    <p style="margin:0 0 4px;text-align:left;">${escapeHtml(person || '参加者')} 様</p>
    ${waitlistNotice}
    ${numberCard('受付番号', entryNumber)}
    ${detailsTable([['パスワード', password], ['状態', status]])}
    <p style="margin:0;font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;text-align:left;">パスワードはマイエントリー、編集、キャンセルなどに使用します。</p>
    ${qrCard(qrImageUrl)}
    ${panel('このメールには受付QRとマイエントリー用の情報が含まれます。大会当日まで保存してください。', 'info')}
    ${buttonPair('マイエントリー', myUrl, 'エントリーリスト', entryListUrl)}
    <p style="margin:0;font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;line-height:1.8;text-align:left;">
      マイエントリーでは、登録内容の確認・変更、遅刻の連絡、QRコードの再表示ができます。
    </p>
  `;
  return {
    subject: `【${name}】エントリー受付完了（No.${entryNumber}）`,
    html: shell('エントリー受付完了', name, body),
    text: [
      `${person || '参加者'} 様`,
      `${name} のエントリーを受け付けました。`,
      `受付番号: ${entryNumber}`,
      data.status === 'waitlist' ? `状態: ${status}` : '',
      `パスワード: ${password}`,
      'このメールには受付QRとマイエントリー用の情報が含まれます。大会当日まで保存してください。',
      'QRコードはマイエントリーからも再表示できます。',
      myUrl ? `マイエントリー: ${myUrl}` : '',
      entryListUrl ? `エントリーリスト: ${entryListUrl}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function simpleNotice(args: {
  data: Record<string, unknown>;
  subjectLabel: string;
  title: string;
  message: string;
  tone: string;
  withMyCta: boolean;
}): EmailTemplate {
  const name = projectName(args.data);
  const entryNumber = String(args.data.entryNumber || '');
  const myUrl = args.withMyCta ? String(args.data.myUrl || '') : '';
  const person = `${args.data.familyName || ''} ${args.data.firstName || ''}`.trim();
  return {
    subject: `【${name}】${args.subjectLabel}（No.${entryNumber}）`,
    html: shell(args.title, name, `
      <p style="margin:0 0 4px;text-align:left;">${escapeHtml(person || '参加者')} 様</p>
      ${panel(args.message, args.tone)}
      ${detailsTable([['受付番号', entryNumber]])}
      ${myUrl ? primaryButton('マイエントリーを開く', myUrl) : ''}
    `),
    text: [
      `${person || '参加者'} 様`,
      `${name} — ${args.message}`,
      `受付番号: ${entryNumber}`,
      myUrl ? `マイエントリー: ${myUrl}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function cancellation(data: Record<string, unknown>): EmailTemplate {
  // キャンセル後に呼び戻す行動はないため、CTAは置かない
  return simpleNotice({
    data,
    subjectLabel: 'エントリーキャンセル完了',
    title: 'キャンセル完了',
    message: 'エントリーをキャンセルしました。',
    tone: 'danger',
    withMyCta: false,
  });
}

function entryEdited(data: Record<string, unknown>): EmailTemplate {
  return simpleNotice({
    data,
    subjectLabel: 'エントリー編集完了',
    title: 'エントリー編集完了',
    message: 'エントリー内容の変更を受け付けました。',
    tone: 'success',
    withMyCta: true,
  });
}

function lateNotice(data: Record<string, unknown>): EmailTemplate {
  return simpleNotice({
    data,
    subjectLabel: '遅刻連絡受付',
    title: '遅刻連絡受付',
    message: '遅刻の届け出を受け付けました。',
    tone: 'warning',
    withMyCta: true,
  });
}

function waitlistPromoted(data: Record<string, unknown>): EmailTemplate {
  return simpleNotice({
    data,
    subjectLabel: 'キャンセル待ち繰り上げのお知らせ',
    title: 'キャンセル待ち繰り上げ',
    message: 'キャンセル待ちから通常エントリーへ繰り上がりました。',
    tone: 'success',
    withMyCta: true,
  });
}

function verificationEmail(projectNameValue: string, code: string): EmailTemplate {
  return {
    subject: `【${projectNameValue}】メール認証コード`,
    html: shell('メール認証コード', projectNameValue, `
      <p style="margin:0;text-align:left;">エントリーフォームに以下のコードを入力してください。</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
        <tr>
          <td align="center" style="border:1px solid ${MAIL.borderStrong};border-radius:10px;padding:24px;background:${MAIL.surface};">
            <span style="font-family:${MAIL_MONO};font-size:36px;font-weight:600;letter-spacing:10px;color:${MAIL.text};">${escapeHtml(code)}</span>
          </td>
        </tr>
      </table>
      <p style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;margin:0;text-align:left;">このコードは10分間有効です。届かない場合は迷惑メールフォルダも確認してください。</p>
    `),
    text: `認証コード: ${code}\nこのコードは10分間有効です。`,
  };
}

const templates: Record<string, (data: Record<string, unknown>) => EmailTemplate> = {
  entry_confirmation: entryConfirmation,
  entry_edited: entryEdited,
  entry_cancelled: cancellation,
  late_notice: lateNotice,
  waitlist_promoted: waitlistPromoted,
};

async function enforceRateLimit(supabase: ReturnType<typeof createServiceClient>, recipientHash: string, template: string) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_hash', recipientHash)
    .eq('template', template)
    .gte('created_at', since);
  if (error) throw error;
  const limit = template === 'send_verification' ? 5 : 10;
  if ((count || 0) >= limit) throw new Error('Too many email requests. Please wait.');
}

async function getProjectForMail(supabase: ReturnType<typeof createServiceClient>, projectId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, entry_open, period_start, period_end, notify_entry_edit, notify_entry_cancel, notify_late_notice')
    .eq('id', projectId)
    .single();
  if (error || !data) throw new Error('Project not found');
  return data;
}

function isNotificationEnabled(project: Record<string, unknown>, template: string) {
  if (template === 'entry_edited') return project.notify_entry_edit !== false;
  if (template === 'entry_cancelled') return project.notify_entry_cancel !== false;
  if (template === 'late_notice') return project.notify_late_notice !== false;
  return true;
}

function assertEntryOpen(project: { entry_open: boolean; period_start: string | null; period_end: string | null }) {
  const now = Date.now();
  if (!project.entry_open) throw new Error('Entry is closed');
  if (project.period_start && new Date(project.period_start).getTime() > now) throw new Error('Entry period has not started');
  if (project.period_end && new Date(project.period_end).getTime() < now) throw new Error('Entry period has ended');
}

async function assertEntryRecipient(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  entryId: string,
  recipientHash: string,
  expectedEmailHash: string,
) {
  if (!entryId || !expectedEmailHash) throw new Error('Missing entry verification fields');
  if (!safeEqual(recipientHash, expectedEmailHash)) throw new Error('Recipient mismatch');
  const { data, error } = await supabase
    .from('entries')
    .select('id, email_hash, project_id')
    .eq('id', entryId)
    .eq('project_id', projectId)
    .single();
  if (error || !data) throw new Error('Entry not found');
  if (!safeEqual(data.email_hash, recipientHash)) throw new Error('Recipient mismatch');
}

async function recordAndSend(args: {
  projectId: string | null;
  entryId?: string | null;
  recipientHash: string;
  template: string;
  to: string;
  message: EmailTemplate;
}) {
  const supabase = createServiceClient();
  if (!args.projectId) throw new Error('Project is required');
  await enforceRateLimit(supabase, args.recipientHash, args.template);

  const { data: queued, error: queueError } = await supabase
    .from('email_events')
    .insert({
      project_id: args.projectId,
      entry_id: args.entryId || null,
      recipient_hash: args.recipientHash,
      template: args.template,
      provider: emailProviderName(),
      status: 'queued',
    })
    .select('id')
    .single();

  if (queueError) throw queueError;

  try {
    const providerResult = await sendProviderEmail({
      to: args.to,
      subject: args.message.subject,
      html: args.message.html,
      text: args.message.text,
    });
    await supabase
      .from('email_events')
      .update({
        status: 'sent',
        provider: providerResult.provider,
        provider_message_id: providerResult.providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', queued.id);
    return { ok: true, id: queued.id, provider: providerResult.provider, providerMessageId: providerResult.providerMessageId };
  } catch (error) {
    await supabase
      .from('email_events')
      .update({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
      .eq('id', queued.id);
    throw error;
  }
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { type, to, data = {}, projectId, entryId } = await req.json();
    if (!type || !to) return jsonResponse({ error: 'メール送信に必要な宛先または種別が不足しています。' }, 400);

    const normalizedEmail = String(to).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return jsonResponse({ error: 'Invalid email address' }, 400);
    }
    const recipientHash = await sha256Hex(normalizedEmail);

    if (type === 'verify_code') {
      const code = String(data.code || '').trim();
      const signature = String(data.signature || '');
      const expiresAt = Number(data.expiresAt || 0);
      if (!code || !signature || !expiresAt) return jsonResponse({ error: 'Missing verification fields' }, 400);
      if (Date.now() > expiresAt) return jsonResponse({ verified: false, error: 'Code expired' }, 400);
      const expected = await hmacHex(signingSecret(), `${code}:${normalizedEmail}:${expiresAt}`);
      return jsonResponse({ verified: safeEqual(expected, signature) });
    }

    if (type === 'send_verification') {
      const effectiveProjectId = projectId || String(data.projectId || '');
      if (!effectiveProjectId) return jsonResponse({ error: 'Project is required' }, 400);
      const supabase = createServiceClient();
      await enforceIpRateLimit(supabase, { bucket: 'send_verification', ip: clientIp(req), projectId: effectiveProjectId });
      const project = await getProjectForMail(supabase, effectiveProjectId);
      assertEntryOpen(project);

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
      const expiresAt = Date.now() + 10 * 60 * 1000;
      const signature = await hmacHex(signingSecret(), `${code}:${normalizedEmail}:${expiresAt}`);
      const name = projectName({ ...data, projectName: data.projectName || project.name });
      const result = await recordAndSend({
        projectId: effectiveProjectId,
        recipientHash,
        template: type,
        to: normalizedEmail,
        message: verificationEmail(name, code),
      });
      return jsonResponse({ success: true, signature, expiresAt, emailEventId: result.id });
    }

    const template = templates[type];
    if (!template) return jsonResponse({ error: `Unknown template type: ${type}` }, 400);

    const effectiveProjectId = projectId || String(data.projectId || '');
    if (!effectiveProjectId) return jsonResponse({ error: 'Project is required' }, 400);
    const effectiveEntryId = entryId || String(data.entryId || '');
    const expectedEmailHash = String(data.emailHash || '');
    if (!effectiveEntryId || !expectedEmailHash) {
      return jsonResponse({ error: 'メール送信に必要なエントリー確認情報が不足しています。ページを再読み込みしてからもう一度お試しください。' }, 400);
    }
    const supabase = createServiceClient();
    const project = await getProjectForMail(supabase, effectiveProjectId);
    await assertEntryRecipient(supabase, effectiveProjectId, effectiveEntryId, recipientHash, expectedEmailHash);
    if (!isNotificationEnabled(project, type)) {
      return jsonResponse({ success: true, skipped: true, reason: 'notification_disabled' });
    }
    if (type === 'entry_confirmation') {
      const qrData = String(data.qrData || effectiveEntryId);
      data.qrImageUrl = await signedQrUrl(qrData);
      const message = template(data);
      const result = await recordAndSend({
        projectId: effectiveProjectId,
        entryId: effectiveEntryId,
        recipientHash,
        template: type,
        to: normalizedEmail,
        message,
      });
      return jsonResponse({ success: true, ...result });
    }

    const message = template(data);
    const result = await recordAndSend({
      projectId: effectiveProjectId,
      entryId: effectiveEntryId,
      recipientHash,
      template: type,
      to: normalizedEmail,
      message,
    });
    return jsonResponse({ success: true, ...result });
  } catch (error) {
    if (error instanceof SigningConfigError) {
      console.error('[send-email] signing secret is not configured');
      return jsonResponse({ error: 'メールを送信できませんでした。運営にお問い合わせください。' }, 503);
    }
    if (error instanceof RateLimitError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Too many email requests')) {
      return jsonResponse({ error: message }, 429);
    }
    if (message.includes('Missing entry verification fields')) {
      return jsonResponse({ error: 'メール送信に必要なエントリー確認情報が不足しています。ページを再読み込みしてからもう一度お試しください。' }, 400);
    }
    return serverErrorResponse(error, 'send-email');
  }
}));
