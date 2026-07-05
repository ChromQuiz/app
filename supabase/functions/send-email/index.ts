import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { emailProviderName, sendProviderEmail } from '../_shared/email_provider.ts';

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

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function signingSecret() {
  return Deno.env.get('CIQ_EMAIL_SIGNING_SECRET')
    || Deno.env.get('CIQ_EDGE_INTERNAL_SECRET')
    || Deno.env.get('SUPABASE_URL')
    || 'ciq-local-email-signing-secret';
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
 * HTMLメール — CIQ Design System "Calm Command" と同一トークン
 * design-system/MASTER.md 準拠:
 *   ink #191827 / paper #f6f6fa / iris #483ed1 (#5a50e8) /
 *   ok #187a41 / warn #a05a00 / bad #c22945 / gold #9a6a00
 * メールクライアント互換のため 600px テーブルレイアウト +
 * インラインCSS のみを使用（Outlook/Gmail/Apple Mail）。
 * ------------------------------------------------------------ */
const MAIL_FONT = "'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Hiragino Sans',Meiryo,sans-serif";
const MAIL_MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

function shell(title: string, subtitle: string, body: string) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6fa;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
          <tr>
            <td style="font-family:${MAIL_MONO};font-size:15px;font-weight:700;letter-spacing:.3em;color:#55536b;padding:0 8px 12px;" align="left">
              C I Q
            </td>
          </tr>
          <tr>
            <td style="background:#191827;border-radius:16px 16px 0 0;padding:28px 28px 24px;border-bottom:3px solid #5a50e8;" align="left">
              <div style="font-family:${MAIL_FONT};color:#a9a3f6;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px;">${escapeHtml(subtitle)}</div>
              <div style="font-family:${MAIL_FONT};color:#ffffff;font-size:22px;line-height:1.35;font-weight:700;letter-spacing:-.01em;">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px;font-family:${MAIL_FONT};color:#191827;font-size:14px;line-height:1.8;" align="left">${body}</td>
          </tr>
          <tr>
            <td style="background:#f1f0f7;border-radius:0 0 16px 16px;padding:16px 28px;font-family:${MAIL_FONT};text-align:center;font-size:12px;line-height:1.7;color:#8b89a3;border-top:1px solid #e5e4f0;">
              このメールは CIQ から自動送信されています。<br>心当たりがない場合は大会運営へお問い合わせください。
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

function panel(body: string, tone = 'info') {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    info: { bg: '#efeefd', border: '#c5c1f5', color: '#3a31ac' },
    success: { bg: '#dff5e8', border: '#9adcb8', color: '#187a41' },
    warning: { bg: '#fdeed3', border: '#f0cd93', color: '#a05a00' },
    danger: { bg: '#fce7eb', border: '#f2b2c0', color: '#c22945' },
  };
  const s = styles[tone] || styles.info;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
    <tr>
      <td style="background:${s.bg};border:1px solid ${s.border};border-radius:12px;padding:14px 16px;font-family:${MAIL_FONT};color:${s.color};font-size:14px;line-height:1.7;font-weight:700;">${body}</td>
    </tr>
  </table>
  `;
}

function detailsTable(rows: Array<[string, unknown]>) {
  const last = rows.length - 1;
  const tableRows = rows.map(([label, value], i) => `
    <tr>
      <td style="padding:13px 16px;font-family:${MAIL_FONT};font-size:13px;font-weight:600;color:#8b89a3;${i === last ? '' : 'border-bottom:1px solid #e5e4f0;'}">${escapeHtml(label)}</td>
      <td align="right" style="padding:13px 16px;font-family:${MAIL_MONO};font-size:15px;font-weight:700;color:#191827;letter-spacing:.04em;${i === last ? '' : 'border-bottom:1px solid #e5e4f0;'}">${escapeHtml(value)}</td>
    </tr>
  `).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e4f0;border-radius:12px;margin:18px 0;background:#ffffff;">
    ${tableRows}
  </table>
  `;
}

function primaryButton(label: string, href: string) {
  if (!href) return '';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#483ed1;color:#ffffff;text-decoration:none;font-family:${MAIL_FONT};font-size:14px;font-weight:700;border-radius:12px;padding:12px 22px;margin:4px 8px 4px 0;">${escapeHtml(label)}</a>`;
}

function secondaryButton(label: string, href: string) {
  if (!href) return '';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#ffffff;color:#483ed1;text-decoration:none;font-family:${MAIL_FONT};font-size:14px;font-weight:700;border:1px solid #c9c7dc;border-radius:12px;padding:11px 21px;margin:4px 8px 4px 0;">${escapeHtml(label)}</a>`;
}

function entryConfirmation(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const status = data.status === 'waitlist' ? 'キャンセル待ち' : '登録完了';
  const password = String(data.password || '');
  const editUrl = String(data.editUrl || '');
  const entryListUrl = String(data.entryListUrl || '');
  const qrImageUrl = String(data.qrImageUrl || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  const waitlistNotice = data.status === 'waitlist'
    ? panel('現在はキャンセル待ちです。繰り上がった場合は別途メールでお知らせします。', 'warning')
    : panel('エントリーを受け付けました。大会当日までこのメールを保管してください。', 'success');
  const actionButtons = `
    <div style="margin:18px 0;">
      ${primaryButton('エントリーを編集', editUrl)}
      ${secondaryButton('エントリーリストを見る', entryListUrl)}
    </div>
  `;
  const body = `
    <p>${escapeHtml(person || '参加者')} 様</p>
    ${waitlistNotice}
    ${detailsTable([['受付番号', entryNumber], ['パスワード', password], ['状態', status]])}
    ${qrImageUrl ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
        <tr>
          <td align="center" style="background:#f6f6fa;border:1px solid #e5e4f0;border-radius:16px;padding:20px;">
            <img src="${escapeHtml(qrImageUrl)}" alt="当日受付用QRコード" width="184" height="184" style="display:block;margin:0 auto;border:1px solid #c9c7dc;border-radius:12px;padding:12px;background:#ffffff;">
            <div style="font-family:${MAIL_FONT};color:#55536b;font-size:12px;font-weight:700;margin-top:12px;letter-spacing:.04em;">当日受付用QRコード</div>
          </td>
        </tr>
      </table>
    ` : ''}
    ${panel('当日受付には、このメールに表示されたQRコードが必要です。', 'info')}
    ${actionButtons}
    <p style="color:#64748b;font-size:13px;">このメールは大会当日まで保管してください。</p>
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
      `当日受付には、このメールに表示されたQRコードが必要です。`,
      editUrl ? `編集: ${editUrl}` : '',
      entryListUrl ? `エントリーリスト: ${entryListUrl}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function cancellation(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  return {
    subject: `【${name}】エントリーキャンセル完了（No.${entryNumber}）`,
    html: shell('キャンセル完了', name, `
      <p>${escapeHtml(person || '参加者')} 様</p>
      ${panel('エントリーをキャンセルしました。', 'danger')}
      ${detailsTable([['受付番号', entryNumber]])}
    `),
    text: [
      `${person || '参加者'} 様`,
      `${name} のエントリーをキャンセルしました。`,
      `受付番号: ${entryNumber}`,
    ].join('\n'),
  };
}

function entryEdited(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  return {
    subject: `【${name}】エントリー編集完了（No.${entryNumber}）`,
    html: shell('エントリー編集完了', name, `
      <p>${escapeHtml(person || '参加者')} 様</p>
      ${panel('エントリー内容の変更を受け付けました。', 'success')}
      ${detailsTable([['受付番号', entryNumber]])}
    `),
    text: [
      `${person || '参加者'} 様`,
      `${name} のエントリー内容の変更を受け付けました。`,
      `受付番号: ${entryNumber}`,
    ].join('\n'),
  };
}

function lateNotice(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  return {
    subject: `【${name}】遅刻連絡受付（No.${entryNumber}）`,
    html: shell('遅刻連絡受付', name, `
      <p>${escapeHtml(person || '参加者')} 様</p>
      ${panel('遅刻の届け出を受け付けました。', 'warning')}
      ${detailsTable([['受付番号', entryNumber]])}
    `),
    text: [
      `${person || '参加者'} 様`,
      `${name} の遅刻の届け出を受け付けました。`,
      `受付番号: ${entryNumber}`,
    ].join('\n'),
  };
}

function waitlistPromoted(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  return {
    subject: `【${name}】キャンセル待ち繰り上げのお知らせ（No.${entryNumber}）`,
    html: shell('キャンセル待ち繰り上げ', name, `
      <p>${escapeHtml(person || '参加者')} 様</p>
      ${panel('キャンセル待ちから通常エントリーへ繰り上がりました。', 'success')}
      ${detailsTable([['受付番号', entryNumber]])}
    `),
    text: [
      `${person || '参加者'} 様`,
      `${name} のキャンセル待ちから通常エントリーへ繰り上がりました。`,
      `受付番号: ${entryNumber}`,
    ].join('\n'),
  };
}

function verificationEmail(projectNameValue: string, code: string): EmailTemplate {
  return {
    subject: `【${projectNameValue}】メール認証コード`,
    html: shell('メール認証コード', projectNameValue, `
      ${panel('エントリーフォームに以下のコードを入力してください。', 'info')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
        <tr>
          <td align="center" style="background:#ffffff;border:2px solid #5a50e8;border-radius:16px;padding:22px;">
            <span style="font-family:${MAIL_MONO};font-size:36px;font-weight:700;letter-spacing:10px;color:#191827;">${escapeHtml(code)}</span>
          </td>
        </tr>
      </table>
      <p style="font-family:${MAIL_FONT};color:#8b89a3;font-size:13px;margin:0;">このコードは10分間有効です。</p>
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

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { type, to, data = {}, projectId, entryId } = await req.json();
    if (!type || !to) return jsonResponse({ error: 'Missing required fields' }, 400);

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
      return jsonResponse({ error: 'Missing entry verification fields' }, 400);
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
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Too many email requests') ? 429 : 500;
    return jsonResponse({ error: message }, status);
  }
});