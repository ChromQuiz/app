export type BrevoMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function sender() {
  const email = env('BREVO_FROM_EMAIL');
  const name = Deno.env.get('BREVO_FROM_NAME') || Deno.env.get('CIQ_EMAIL_FROM_NAME') || 'CIQ';
  return { email, name };
}

export async function sendBrevoEmail(message: BrevoMessage) {
  const apiKey = env('BREVO_API_KEY');
  const payload = {
    sender: sender(),
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text ?? message.subject,
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Brevo send failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}
