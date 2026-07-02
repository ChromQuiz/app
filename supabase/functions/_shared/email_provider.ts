import { sendBrevoEmail } from './brevo.ts';
import { sendSesEmail } from './ses.ts';

export type ProviderEmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type ProviderEmailResult = {
  provider: string;
  providerMessageId: string | null;
};

export function emailProviderName() {
  const provider = (Deno.env.get('CIQ_EMAIL_PROVIDER') || 'brevo').trim().toLowerCase();
  if (provider === 'ses' || provider === 'aws-ses') return 'ses';
  if (provider === 'brevo' || provider === 'sendinblue') return 'brevo';
  throw new Error(`Unsupported email provider: ${provider}`);
}

export async function sendProviderEmail(message: ProviderEmailMessage): Promise<ProviderEmailResult> {
  const provider = emailProviderName();
  if (provider === 'ses') {
    const result = await sendSesEmail(message);
    return { provider, providerMessageId: result?.MessageId || null };
  }

  const result = await sendBrevoEmail(message);
  return { provider, providerMessageId: result?.messageId || result?.messageIds?.[0] || null };
}
