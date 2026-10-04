// pii_decrypt.ts — 参加者の個人情報（RSA-OAEP + AES-GCM のハイブリッド形式）をサーバーで復号する。
// 形式は js/crypto.js の AppCrypto.encryptRSA / decryptRSA と同じ: IV(12) + 鍵長(2) + 暗号化した AES 鍵 + 暗号文。
// 復号した値は呼び出し側のメモリにだけ置く。ログに出さない・保存しない。

export async function decryptPii(base64Data: string, privateKeyJwk: JsonWebKey): Promise<Record<string, unknown>> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
  const combined = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const keyLength = (combined[12] << 8) | combined[13];
  const encryptedKey = combined.slice(14, 14 + keyLength);
  const encryptedData = combined.slice(14 + keyLength);
  const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedKey);
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encryptedData);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
