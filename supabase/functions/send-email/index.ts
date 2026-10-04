import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { emailProviderName, sendProviderEmail } from '../_shared/email_provider.ts';
import { hmacHex, safeEqual, signingSecret, SigningConfigError } from '../_shared/signing.ts';
import { logServiceEvent } from '../_shared/audit.ts';
import { getBearerToken, requireAdminMember } from '../_shared/project_key.ts';
import { processPromotionNotices } from '../_shared/promotion_notice.ts';
import { clientIp, clientIpHash, enforceIpRateLimit, enforceProjectDailyEmailCap, RateLimitError } from '../_shared/rate_limit.ts';
import { emailHashFromNormalized, issueEmailVerifiedToken, verifyEmailVerifiedToken } from '../_shared/email_verify.ts';
import { ParticipantHashConfigError, pepperHash } from '../_shared/participant_hash.ts';
import { TurnstileConfigError, TurnstileError, verifyTurnstile } from '../_shared/turnstile.ts';
import { isValidEmailAddress } from '../_shared/email_address.ts';

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
 * HTMLメール — CIQ Swift App と同じ grouped surface / pill CTA の静かな白黒グレー基調。
 * メールクライアント互換のため table + inline CSS のみを使用する。
 * ------------------------------------------------------------ */
const MAIL_FONT = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Hiragino Sans',Meiryo,sans-serif";
const MAIL_MONO = "'SF Mono','SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
const MAIL = {
  canvas: '#f2f2f7',
  paper: '#f2f2f7',
  surface: '#ffffff',
  surface2: '#f8f8fb',
  text: '#111113',
  sub: '#5f6067',
  muted: '#8a8b93',
  border: '#d9d9df',
  borderStrong: '#c7c7cf',
  accent: '#111113',
  accentInk: '#ffffff',
  blue: '#0066cc',
};

function shell(title: string, subtitle: string, body: string) {
  return `
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    html, body { margin: 0 !important; padding: 0 !important; background: ${MAIL.canvas} !important; }
    @media screen and (max-width: 560px) {
      .ciq-mail-canvas { padding: 20px 10px !important; }
      .ciq-mail-card { padding: 22px 18px !important; }
      .ciq-mail-button-cell { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
    }
    @media (prefers-color-scheme: dark) {
      html, body { background: #1c1c1e !important; }
      .ciq-mail-canvas { background: #1c1c1e !important; }
      .ciq-mail-title,
      .ciq-mail-copy,
      .ciq-mail-text,
      .ciq-mail-value,
      .ciq-mail-code,
      .ciq-mail-label-strong {
        color: #f5f5f7 !important;
        -webkit-text-fill-color: #f5f5f7 !important;
      }
      .ciq-mail-sub,
      .ciq-mail-label,
      .ciq-mail-note,
      .ciq-mail-footer {
        color: #aeaeb2 !important;
        -webkit-text-fill-color: #aeaeb2 !important;
      }
      .ciq-mail-muted {
        color: #8e8e93 !important;
        -webkit-text-fill-color: #8e8e93 !important;
      }
      .ciq-mail-card,
      .ciq-mail-surface { background: #2c2c2e !important; border-color: #48484a !important; }
      .ciq-mail-surface-2 { background: #242426 !important; border-color: #48484a !important; }
      .ciq-mail-code-box { background: #2c2c2e !important; border-color: #5a5a5f !important; }
      .ciq-mail-line { border-color: #48484a !important; }
      .ciq-mail-button-primary { background: #f5f5f7 !important; border-color: #f5f5f7 !important; }
      .ciq-mail-button-primary a {
        color: #111113 !important;
        -webkit-text-fill-color: #111113 !important;
      }
      .ciq-mail-button-secondary { background: #2c2c2e !important; border-color: #5a5a5f !important; }
      .ciq-mail-button-secondary a {
        color: #f5f5f7 !important;
        -webkit-text-fill-color: #f5f5f7 !important;
      }
      .ciq-mail-success { border-color: #30d158 !important; }
      .ciq-mail-success .ciq-mail-tone {
        color: #30d158 !important;
        -webkit-text-fill-color: #30d158 !important;
      }
      .ciq-mail-warning { border-color: #ff9f0a !important; }
      .ciq-mail-warning .ciq-mail-tone {
        color: #ff9f0a !important;
        -webkit-text-fill-color: #ff9f0a !important;
      }
      .ciq-mail-danger { border-color: #ff453a !important; }
      .ciq-mail-danger .ciq-mail-tone {
        color: #ff453a !important;
        -webkit-text-fill-color: #ff453a !important;
      }
    }
  </style>
  <table class="ciq-mail-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${MAIL.canvas};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
          <tr>
            <td class="ciq-mail-title" style="font-family:${MAIL_FONT};color:${MAIL.text};font-size:34px;line-height:1.08;font-weight:800;letter-spacing:-0.035em;padding:0 2px 8px;text-align:center;" align="center">
              ${escapeHtml(subtitle)}
            </td>
          </tr>
          <tr>
            <td class="ciq-mail-sub" style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:14px;line-height:1.6;font-weight:600;padding:0 2px 26px;text-align:center;" align="center">
              ${escapeHtml(title)}
            </td>
          </tr>
          <tr>
            <td class="ciq-mail-card" style="background:${MAIL.surface};border:1px solid ${MAIL.border};border-radius:26px;padding:32px;font-family:${MAIL_FONT};color:${MAIL.text};font-size:15px;line-height:1.75;text-align:left;" align="left">${body}</td>
          </tr>
          <tr>
            <td class="ciq-mail-footer" style="font-family:${MAIL_FONT};text-align:center;font-size:12px;line-height:1.7;color:${MAIL.muted};padding:22px 8px 0;">
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
      <td class="ciq-mail-surface-2 ciq-mail-${escapeHtml(tone)}" style="border:1px solid ${tone === 'success' ? '#b8e8c4' : tone === 'warning' ? '#f4d7a2' : tone === 'danger' ? '#f2b8b5' : MAIL.border};border-radius:18px;background:${MAIL.surface2};padding:15px 16px;font-family:${MAIL_FONT};color:${MAIL.text};font-size:14px;line-height:1.75;">
        <div class="ciq-mail-tone" style="font-size:12px;font-weight:800;color:${tone === 'success' ? '#248a3d' : tone === 'warning' ? '#bf6a02' : tone === 'danger' ? '#d70015' : MAIL.sub};margin-bottom:4px;">${escapeHtml(labels[tone] || labels.info)}</div>
        <div class="ciq-mail-text" style="font-weight:600;">${body}</div>
      </td>
    </tr>
  </table>
  `;
}

function detailsTable(rows: Array<[string, unknown]>) {
  const last = rows.length - 1;
  const tableRows = rows.map(([label, value], i) => `
    <tr>
      <td class="ciq-mail-label ciq-mail-line" style="padding:12px 14px;font-family:${MAIL_FONT};font-size:13px;font-weight:700;color:${MAIL.sub};${i === last ? '' : `border-bottom:1px solid ${MAIL.border};`}">${escapeHtml(label)}</td>
      <td class="ciq-mail-value ciq-mail-line" align="right" style="padding:12px 14px;font-family:${MAIL_MONO};font-size:14px;font-weight:700;color:${MAIL.text};letter-spacing:.02em;${i === last ? '' : `border-bottom:1px solid ${MAIL.border};`}">${escapeHtml(value)}</td>
    </tr>
  `).join('');
  return `
  <table class="ciq-mail-surface" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${MAIL.border};border-radius:18px;margin:16px 0;background:${MAIL.surface};">
    ${tableRows}
  </table>
  `;
}

function numberCard(label: string, value: string) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
      <td class="ciq-mail-surface-2" align="center" style="border:1px solid ${MAIL.border};border-radius:22px;padding:22px;background:${MAIL.surface2};">
        <div class="ciq-mail-label" style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:12px;font-weight:800;margin-bottom:4px;">${escapeHtml(label)}</div>
        <div class="ciq-mail-value" style="font-family:${MAIL_MONO};color:${MAIL.text};font-size:36px;font-weight:800;letter-spacing:.04em;line-height:1.1;">${escapeHtml(value)}</div>
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
      <td class="ciq-mail-surface" align="center" style="border:1px solid ${MAIL.border};border-radius:22px;padding:22px;background:${MAIL.surface};">
        <img src="${escapeHtml(qrImageUrl)}" alt="当日受付用二次元コード" width="176" height="176" style="display:block;margin:0 auto;border:0;">
        <div class="ciq-mail-label-strong" style="font-family:${MAIL_FONT};color:${MAIL.text};font-size:13px;font-weight:800;margin-top:12px;">当日受付用二次元コード</div>
        <div class="ciq-mail-sub" style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:12px;margin-top:2px;">当日受付で提示してください。</div>
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
      <td class="ciq-mail-button-primary" align="center" style="background:${MAIL.accent};border:1px solid ${MAIL.accent};border-radius:999px;">
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
          <td class="ciq-mail-button-primary" align="center" style="background:${MAIL.accent};border:1px solid ${MAIL.accent};border-radius:999px;">
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
          <td class="ciq-mail-button-secondary" align="center" style="background:${MAIL.surface};border:1px solid ${MAIL.borderStrong};border-radius:999px;">
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
  const status = data.status === 'waitlist' ? 'キャンセル待ち' : '登録済み';
  const password = String(data.password || '');
  const myUrl = String(data.myUrl || '');
  const entryListUrl = String(data.entryListUrl || '');
  const qrImageUrl = String(data.qrImageUrl || '');
  const person = `${data.familyName || ''} ${data.firstName || ''}`.trim();
  const waitlistNotice = data.status === 'waitlist'
    ? panel('現在はキャンセル待ちです。繰り上がった場合は別途メールでお知らせします。', 'warning')
    : panel('エントリーを受け付けました。', 'success');
  const body = `
    ${person ? `<p class="ciq-mail-copy" style="margin:0 0 4px;text-align:left;color:${MAIL.text};">${escapeHtml(person)} 様</p>` : ''}
    ${waitlistNotice}
    ${numberCard('受付番号', entryNumber)}
    ${detailsTable([['パスワード', password], ['状態', status]])}
    <p class="ciq-mail-note" style="margin:0;font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;text-align:left;">パスワードはマイエントリー、編集、キャンセルなどに使用します。</p>
    ${qrCard(qrImageUrl)}
    ${panel('このメールには受付二次元コードとマイエントリー用の情報が含まれます。大会当日まで保存してください。', 'info')}
    ${buttonPair('マイエントリー', myUrl, 'エントリーリスト', entryListUrl)}
    <p class="ciq-mail-note" style="margin:0;font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;line-height:1.8;text-align:left;">
      マイエントリーでは、エントリー内容の確認・変更、遅刻の連絡、二次元コードの再表示ができます。
    </p>
  `;
  return {
    subject: `【${name}】エントリー受付完了（No.${entryNumber}）`,
    html: shell('エントリー受付完了', name, body),
    text: [
      person ? `${person} 様` : '',
      `${name} のエントリーを受け付けました。`,
      `受付番号：${entryNumber}`,
      data.status === 'waitlist' ? `状態：${status}` : '',
      `パスワード：${password}`,
      'このメールには受付二次元コードとマイエントリー用の情報が含まれます。大会当日まで保存してください。',
      '二次元コードはマイエントリーからも再表示できます。',
      myUrl ? `マイエントリー：${myUrl}` : '',
      entryListUrl ? `エントリーリスト：${entryListUrl}` : '',
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
      ${person ? `<p class="ciq-mail-copy" style="margin:0 0 4px;text-align:left;color:${MAIL.text};">${escapeHtml(person)} 様</p>` : ''}
      ${panel(args.message, args.tone)}
      ${detailsTable([['受付番号', entryNumber]])}
      ${myUrl ? primaryButton('マイエントリーを開く', myUrl) : ''}
    `),
    text: [
      person ? `${person} 様` : '',
      `${name} — ${args.message}`,
      `受付番号：${entryNumber}`,
      myUrl ? `マイエントリー：${myUrl}` : '',
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
    message: '遅刻の連絡を受け付けました。',
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

function verificationEmail(projectNameValue: string, code: string, purpose = 'entry'): EmailTemplate {
  const reset = purpose === 'password_reset';
  const lead = reset ? 'パスワードの再発行のため、以下のコードを入力してください。' : 'エントリーフォームに以下のコードを入力してください。';
  return {
    subject: `【${projectNameValue}】認証コード`,
    html: shell('認証コード', projectNameValue, `
      <p class="ciq-mail-copy" style="margin:0;text-align:left;color:${MAIL.text};">${lead}</p>
      ${numberCard('認証コード', code)}
      <p class="ciq-mail-note" style="font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;margin:0;text-align:left;">このコードは10分間有効です。届かない場合は迷惑メールフォルダもご確認ください。心当たりがない場合は、このメールを破棄してください。</p>
    `),
    text: [
      lead,
      // iPhone のコード候補が読み取る行なので、半角のコロンのままにする(動作確認済み)
      `認証コード: ${code}`,
      'このコードは10分間有効です。心当たりがない場合は、このメールを破棄してください。',
    ].join('\n'),
  };
}

function passwordReissued(data: Record<string, unknown>): EmailTemplate {
  const name = projectName(data);
  const entryNumber = String(data.entryNumber || '');
  const password = String(data.password || '');
  const myUrl = String(data.myUrl || '');
  return {
    subject: `【${name}】パスワードを再発行しました（No.${entryNumber}）`,
    html: shell('パスワードの再発行', name, `
      ${panel('パスワードを再発行しました。以前のパスワードは使えません。', 'success')}
      ${detailsTable([['受付番号', entryNumber], ['新しいパスワード', password]])}
      <p class="ciq-mail-note" style="margin:0;font-family:${MAIL_FONT};color:${MAIL.sub};font-size:13px;text-align:left;">パスワードはマイエントリー、編集、キャンセルなどに使用します。心当たりがない場合は、運営へご連絡ください。</p>
      ${myUrl ? primaryButton('マイエントリーを開く', myUrl) : ''}
    `),
    text: [
      `${name} のパスワードを再発行しました。以前のパスワードは使えません。`,
      `受付番号：${entryNumber}`,
      `新しいパスワード：${password}`,
      '心当たりがない場合は、運営へご連絡ください。',
      myUrl ? `マイエントリー：${myUrl}` : '',
    ].filter(Boolean).join('\n'),
  };
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generatePassword(length = 8) {
  const out: string[] = [];
  const limit = 256 - (256 % PASSWORD_CHARS.length); // 偏りが出ないよう、端の値は捨てる
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out.push(PASSWORD_CHARS[b % PASSWORD_CHARS.length]);
    }
  }
  return out.join('');
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
) {
  if (!entryId) throw new Error('Missing entry verification fields');
  // 宛先所有確認(P2-e5 案B): クライアント供給の hash には依存しない。
  // 送信先メールの sha256(recipientHash) を Edge 内で pepper 化し、DB の email_hash_v2 と直接照合する。
  const recipientHashV2 = await pepperHash(recipientHash);
  const { data, error } = await supabase
    .from('entries')
    .select('id, email_hash_v2, project_id')
    .eq('id', entryId)
    .eq('project_id', projectId)
    .single();
  if (error || !data) throw new Error('Entry not found');
  if (!safeEqual(String(data.email_hash_v2 ?? ''), recipientHashV2)) throw new Error('Recipient mismatch');
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
  if (req.method !== 'POST') return jsonResponse({ error: 'この方法ではアクセスできません。' }, 405);

  try {
    const { type, to, data = {}, projectId, entryId } = await req.json();

    if (type === 'process_promotions') {
      // 繰り上げ通知の自動送信。呼べるのは、定期実行・サーバー内の処理（共有の合言葉つき）か、その大会の管理者だけ。
      const supabase = createServiceClient();
      const cronSecret = Deno.env.get('CIQ_CRON_SECRET') || '';
      const given = req.headers.get('x-ciq-cron-secret') || '';
      const isInternal = Boolean(cronSecret) && Boolean(given) && given.length === cronSecret.length && safeEqual(given, cronSecret);
      const scopeProjectId = String(projectId ?? '').trim();
      if (!isInternal) {
        if (!scopeProjectId) return jsonResponse({ error: '大会情報を取得できませんでした。ページを再読み込みして、もう一度お試しください。' }, 400);
        try {
          await requireAdminMember(supabase, scopeProjectId, getBearerToken(req));
        } catch {
          return jsonResponse({ error: 'この操作を行う権限がありません。' }, 403);
        }
      }
      const siteUrl = (Deno.env.get('CIQ_SITE_URL') || '').trim();
      const projectNames = new Map<string, string>();
      const result = await processPromotionNotices(supabase, {
        projectId: scopeProjectId || undefined,
        send: async (item) => {
          if (!projectNames.has(item.projectId)) {
            const project = await getProjectForMail(supabase, item.projectId);
            projectNames.set(item.projectId, String(project.name || item.projectId));
          }
          const name = projectNames.get(item.projectId) as string;
          const myUrl = /^https?:\/\//i.test(siteUrl)
            ? new URL(`my.html?pid=${encodeURIComponent(item.projectId)}`, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).href
            : '';
          await recordAndSend({
            projectId: item.projectId,
            entryId: item.entryId,
            recipientHash: await pepperHash(await sha256Hex(item.email.normalize('NFKC').trim().toLowerCase())),
            template: 'waitlist_promoted',
            to: item.email.normalize('NFKC').trim().toLowerCase(),
            message: waitlistPromoted({
              projectName: name,
              entryNumber: String(item.entryNumber).padStart(3, '0'),
              familyName: item.familyName,
              firstName: item.firstName,
              myUrl,
            }),
          });
        },
      });
      return jsonResponse({ ok: true, ...result });
    }

    if (!type || !to) return jsonResponse({ error: 'メール送信に必要な宛先または種別が不足しています。' }, 400);

    // 画面側(normalizeEmailInput)と同じく NFKC で全角を半角に直してから検証・ハッシュする
    const normalizedEmail = String(to).normalize('NFKC').trim().toLowerCase();
    if (!isValidEmailAddress(normalizedEmail)) {
      return jsonResponse({ error: 'メールアドレスの形式が正しくありません。全角の文字や空白が入っていないかご確認ください。' }, 400);
    }
    // 宛先所有確認(assertEntryRecipient)は生の sha256 を入力にする(内部で pepper 化して v2 と照合)。
    const recipientHash = await sha256Hex(normalizedEmail);
    // ログ・レート制限に保存/照合する値は pepper 化する(V3: DB 流出時のメール列挙を防ぐ)。
    // email_events.recipient_hash は既存列のまま HMAC 値を保持する(v2 列は作らない)。
    const recipientLogHash = await pepperHash(recipientHash);

    if (type === 'verify_code') {
      const effectiveProjectId = String(projectId ?? data.projectId ?? '').trim();
      if (!effectiveProjectId) return jsonResponse({ error: '大会情報を取得できませんでした。ページを再読み込みして、もう一度お試しください。' }, 400);
      const code = String(data.code || '').trim();
      const signature = String(data.signature || '');
      const expiresAt = Number(data.expiresAt || 0);
      if (!code || !signature || !expiresAt) return jsonResponse({ error: '認証コードの確認に必要な情報が不足しています。認証コードをもう一度送信してください。' }, 400);
      if (Date.now() > expiresAt) return jsonResponse({ verified: false, error: '認証コードの有効期限が切れました。認証コードをもう一度送信してください。' }, 400);
      const expected = await hmacHex(signingSecret(), `${code}:${normalizedEmail}:${expiresAt}`);
      if (!safeEqual(expected, signature)) return jsonResponse({ verified: false });
      // コード検証成功時のみ、メール認証済みトークンを発行(eh はサーバ側で正規化メールから生成)。
      const { token, expiresAt: tokenExpiresAt } = await issueEmailVerifiedToken(effectiveProjectId, normalizedEmail);
      return jsonResponse({ verified: true, emailVerifiedToken: token, emailVerifiedExpiresAt: tokenExpiresAt });
    }

    if (type === 'send_verification') {
      const effectiveProjectId = projectId || String(data.projectId || '');
      if (!effectiveProjectId) return jsonResponse({ error: '大会情報を取得できませんでした。ページを再読み込みして、もう一度お試しください。' }, 400);
      // CAPTCHA(Turnstile)をコード発行の前提にする。クライアントの成功状態は信用せずサーバ検証する。
      // 検証失敗=403 / secret未設定・CF障害=fail-closed。レート制限より前に実行し、無認証の乱用を入口で止める。
      await verifyTurnstile({
        token: data.turnstileToken,
        action: 'send_verification',
        remoteip: clientIp(req),
      });
      const supabase = createServiceClient();
      await enforceIpRateLimit(supabase, { bucket: 'send_verification', ip: clientIp(req), projectId: effectiveProjectId, message: '認証コードの送信回数が上限に達しました。10分ほど待ってから、もう一度お試しください。' });
      // 日次上限(V2 backstop)は無認証の send_verification のみに適用する。
      // 通知系(確認/キャンセル/管理者トリガ)は宛先所有確認・管理者認証で保護済のため cap を共有させず、
      // send_verification 撃ちで正規メールが枯渇(DoS-starvation)しないようにする。
      await enforceProjectDailyEmailCap(supabase, effectiveProjectId);
      const project = await getProjectForMail(supabase, effectiveProjectId);
      // パスワードの再発行は、エントリー期間が終わっていても使えるようにする。
      const purpose = data.purpose === 'password_reset' ? 'password_reset' : 'entry';
      if (purpose === 'entry') assertEntryOpen(project);

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
      const expiresAt = Date.now() + 10 * 60 * 1000;
      const signature = await hmacHex(signingSecret(), `${code}:${normalizedEmail}:${expiresAt}`);
      const name = projectName({ ...data, projectName: data.projectName || project.name });
      if (purpose === 'password_reset') {
        // 登録のないアドレスには送らない。ただし応答は同じ形にして、登録の有無を外から調べられないようにする。
        const emailHashV2 = await pepperHash(await emailHashFromNormalized(normalizedEmail));
        const { data: found, error: foundError } = await supabase
          .from('entries')
          .select('id')
          .eq('project_id', effectiveProjectId)
          .eq('email_hash_v2', emailHashV2)
          .limit(1);
        if (foundError) throw foundError;
        if (!found || found.length === 0) {
          return jsonResponse({ success: true, signature, expiresAt });
        }
      }
      const result = await recordAndSend({
        projectId: effectiveProjectId,
        recipientHash: recipientLogHash,
        template: type,
        to: normalizedEmail,
        message: verificationEmail(name, code, purpose),
      });
      return jsonResponse({ success: true, signature, expiresAt, emailEventId: result.id });
    }

    if (type === 'reset_password') {
      // メール認証を済ませた本人にだけ、新しいパスワードを作ってメールで届ける。画面には出さない。
      const effectiveProjectId = String(projectId ?? data.projectId ?? '').trim();
      if (!effectiveProjectId) return jsonResponse({ error: '大会情報を取得できませんでした。ページを再読み込みして、もう一度お試しください。' }, 400);
      const token = String(data.emailVerifiedToken || '');
      const tokenError = 'メール認証を確認できませんでした。もう一度メール認証を行ってください。';
      if (!token) return jsonResponse({ error: tokenError }, 400);
      const ev = await verifyEmailVerifiedToken(token, effectiveProjectId, recipientHash);
      if (!ev.ok) {
        console.error(`[send-email] reset_password verification rejected: ${ev.reason}`);
        return jsonResponse({ error: tokenError }, 401);
      }
      const supabase = createServiceClient();
      await enforceIpRateLimit(supabase, { bucket: 'participant_auth', ip: clientIp(req), projectId: effectiveProjectId, message: '操作の回数が上限に達しました。時間をおいて再度お試しください。' });
      const project = await getProjectForMail(supabase, effectiveProjectId);

      const password = generatePassword();
      const passwordHashV2 = await pepperHash(await sha256Hex(password));
      const { data: updated, error: updateError } = await supabase
        .from('entries')
        .update({ disclosure_password_hash_v2: passwordHashV2 })
        .eq('project_id', effectiveProjectId)
        .eq('email_hash_v2', recipientLogHash)
        .select('id, entry_number');
      if (updateError) throw updateError;
      if (!updated || updated.length === 0) {
        return jsonResponse({ error: 'このメールアドレスで登録されたエントリーが見つかりません。' }, 404);
      }
      const ipHash = await clientIpHash(req);
      for (const row of updated) {
        await logServiceEvent(supabase, {
          projectId: effectiveProjectId, action: 'entry.password_reset', targetId: String(row.id),
          actorKind: 'participant', actorIpHash: ipHash,
        });
      }
      const entry = updated[0];
      const myUrl = /^https?:\/\//i.test(String(data.myUrl || '')) ? String(data.myUrl) : '';
      await recordAndSend({
        projectId: effectiveProjectId,
        entryId: String(entry.id),
        recipientHash: recipientLogHash,
        template: type,
        to: normalizedEmail,
        message: passwordReissued({ projectName: data.projectName || project.name, entryNumber: entry.entry_number, password, myUrl }),
      });
      return jsonResponse({ success: true });
    }

    const template = templates[type];
    if (!template) return jsonResponse({ error: 'メールの種類が正しくありません。' }, 400);

    const effectiveProjectId = projectId || String(data.projectId || '');
    if (!effectiveProjectId) return jsonResponse({ error: '大会情報を取得できませんでした。ページを再読み込みして、もう一度お試しください。' }, 400);
    const effectiveEntryId = entryId || String(data.entryId || '');
    // 宛先所有確認は送信先メールと DB の email_hash_v2 のみで行う(クライアント供給 hash は使わない)。
    if (!effectiveEntryId) {
      return jsonResponse({ error: 'メール送信に必要なエントリー確認情報が不足しています。ページを再読み込みしてからもう一度お試しください。' }, 400);
    }
    const supabase = createServiceClient();
    const project = await getProjectForMail(supabase, effectiveProjectId);
    await assertEntryRecipient(supabase, effectiveProjectId, effectiveEntryId, recipientHash);
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
        recipientHash: recipientLogHash,
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
      recipientHash: recipientLogHash,
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
    if (error instanceof TurnstileError) {
      // 内部理由(code)はサーバログのみ。利用者には再試行可能な汎用文言を返す。
      console.error(`[send-email] turnstile rejected: ${error.code}`);
      return jsonResponse({ error: '認証を完了できませんでした。ページを再読み込みして、もう一度お試しください。' }, error.status);
    }
    if (error instanceof TurnstileConfigError) {
      console.error('[send-email] turnstile secret is not configured');
      return jsonResponse({ error: 'ただいまメールを送信できません。時間をおいて再度お試しください。' }, error.status);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Too many email requests')) {
      return jsonResponse({ error: 'メールの送信回数が上限に達しました。時間をおいて再度お試しください。' }, 429);
    }
    // 受付状態は参加者が取れる行動(待つ・運営に確認する)が違うため、汎用 500 に丸めずに伝える。
    if (message.includes('Entry is closed')) {
      return jsonResponse({ error: 'ただいまエントリーを受け付けていません。' }, 409);
    }
    if (message.includes('Entry period has not started')) {
      return jsonResponse({ error: 'エントリーの受付はまだ始まっていません。' }, 409);
    }
    if (message.includes('Entry period has ended')) {
      return jsonResponse({ error: 'エントリーの受付は終了しました。' }, 409);
    }
    if (message.includes('Project not found')) {
      return jsonResponse({ error: '大会が見つかりません。URLをご確認ください。' }, 404);
    }
    if (message.includes('Missing entry verification fields')) {
      return jsonResponse({ error: 'メール送信に必要なエントリー確認情報が不足しています。ページを再読み込みしてからもう一度お試しください。' }, 400);
    }
    if (error instanceof ParticipantHashConfigError) {
      console.error('[send-email] participant hash pepper is not configured');
      return jsonResponse({ error: 'メールを送信できませんでした。運営にお問い合わせください。' }, 503);
    }
    // メール会社(Brevo / SES)の失敗。汎用の 500 に丸めず、利用者が取れる行動が分かる応答にする。
    // 失敗の詳細は email_events.error に記録済み(ここでは本文を出さない)。
    if (message.startsWith('Brevo send failed') || message.startsWith('SES send failed')) {
      console.error(`[send-email] provider rejected the message: ${message.slice(0, 120)}`);
      if (/ 400 /.test(message) && /not valid|invalid/i.test(message)) {
        return jsonResponse({ error: 'このメールアドレスには送信できません。メールアドレスをご確認ください。' }, 400);
      }
      return jsonResponse({ error: 'メールを送信できませんでした。時間をおいて再度お試しください。解決しない場合は運営にお問い合わせください。' }, 502);
    }
    return serverErrorResponse(error, 'send-email');
  }
}));
