import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAppCrypto() {
  globalThis.crypto = webcrypto;
  const src = readFileSync(join(__dirname, '../js/crypto.js'), 'utf8');
  const fn = new Function(src + '; return AppCrypto;');
  return fn();
}

describe('AppCrypto', () => {
  let AppCrypto;

  beforeAll(() => {
    AppCrypto = loadAppCrypto();
  });

  it('hashPassword produces deterministic SHA-256 hex', async () => {
    const h1 = await AppCrypto.hashPassword('test-password');
    const h2 = await AppCrypto.hashPassword('test-password');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('encryptAES / decryptAES round-trips text', async () => {
    const plain = 'CIQ test payload 日本語';
    const encrypted = await AppCrypto.encryptAES(plain, 'secret-key');
    const decrypted = await AppCrypto.decryptAES(encrypted, 'secret-key');
    expect(decrypted).toBe(plain);
  });

  it('generateRSAKeyPair and encryptRSA / decryptRSA round-trips', async () => {
    const { publicKeyJwk, privateKeyJwk } = await AppCrypto.generateRSAKeyPair();
    const plain = '{"email":"user@example.com"}';
    const encrypted = await AppCrypto.encryptRSA(plain, publicKeyJwk);
    const decrypted = await AppCrypto.decryptRSA(encrypted, privateKeyJwk);
    expect(decrypted).toBe(plain);
  });
});
