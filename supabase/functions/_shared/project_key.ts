// project_key.ts — プロジェクトの秘密鍵（サーバー側で包んで保存したもの）の取り出しと、管理者の確認。
// project-key（管理画面への受け渡し）と、繰り上げ通知（サーバーが宛先を復号して送る）が共有する。

import { createServiceClient } from './supabase.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function getBearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function getKeySecret() {
  const secret = Deno.env.get('PROJECT_KEY_ENCRYPTION_SECRET');
  if (!secret || secret.length < 32) {
    throw new Error('PROJECT_KEY_ENCRYPTION_SECRET is not configured');
  }
  return secret;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveWrappingKey(secret: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function wrapPrivateKey(privateKeyJwk: unknown) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveWrappingKey(getKeySecret(), salt);
  const plaintext = enc.encode(JSON.stringify(privateKeyJwk));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(ciphertext, salt.length + iv.length);
  return `v1.${toBase64(combined)}`;
}

export async function unwrapPrivateKey(wrapped: string) {
  if (!wrapped.startsWith('v1.')) throw new Error('Unsupported project key format');
  const combined = fromBase64(wrapped.slice(3));
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);
  const key = await deriveWrappingKey(getKeySecret(), salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(dec.decode(plaintext));
}

export async function requireAdminMember(supabase: ReturnType<typeof createServiceClient>, projectId: string, token: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.id) throw new Error('Authentication required');

  const { data: member, error } = await supabase
    .from('project_members')
    .select('id, role, status')
    .eq('project_id', projectId)
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .single();
  if (error || !member) throw new Error('Forbidden');
  return member;
}

