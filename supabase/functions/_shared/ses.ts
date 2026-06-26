type SesMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

const encoder = new TextEncoder();

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function toAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function hmac(key: Uint8Array | string, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data)));
}

async function sha256Hex(data: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signingKey(secret: string, date: string, region: string) {
  const kDate = await hmac(`AWS4${secret}`, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'ses');
  return hmac(kService, 'aws4_request');
}

export async function sendSesEmail(message: SesMessage) {
  const region = env('AWS_REGION');
  const accessKeyId = env('AWS_ACCESS_KEY_ID');
  const secretAccessKey = env('AWS_SECRET_ACCESS_KEY');
  const from = env('SES_FROM_EMAIL');

  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/v2/email/outbound-emails`;
  const amzDate = toAmzDate();
  const dateStamp = amzDate.slice(0, 8);
  const payload = JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: [message.to] },
    ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: message.html, Charset: 'UTF-8' },
          Text: { Data: message.text ?? message.subject, Charset: 'UTF-8' },
        },
      },
    },
  });

  const payloadHash = await sha256Hex(payload);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [
    'POST',
    '/v2/email/outbound-emails',
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hex(await hmac(await signingKey(secretAccessKey, dateStamp, region), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-amz-date': amzDate,
      authorization,
    },
    body: payload,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`SES send failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}
