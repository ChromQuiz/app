/**
 * Web Crypto API Utility for E2E Encryption
 */

const AppCrypto = {
    randomBytes(length) {
        return crypto.getRandomValues(new Uint8Array(length));
    },

    randomString(length, alphabet) {
        if (!Number.isInteger(length) || length < 1) throw new Error('Invalid random string length');
        if (!alphabet || alphabet.length < 2) throw new Error('Invalid random string alphabet');
        const max = Math.floor(256 / alphabet.length) * alphabet.length;
        let result = '';
        while (result.length < length) {
            const bytes = this.randomBytes(Math.max(16, length - result.length));
            for (const byte of bytes) {
                if (byte >= max) continue;
                result += alphabet[byte % alphabet.length];
                if (result.length === length) break;
            }
        }
        return result;
    },

    randomUUID() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const bytes = this.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },

    // === SHA-256 Hashing ===
    async hashPassword(password) {
        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // === AES-GCM Encryption (Symmetric, Password-based) ===
    async _getAESKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    async encryptAES(text, password) {
        const salt = this.randomBytes(16);
        const key = await this._getAESKey(password, salt);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(text)
        );
        
        // v2 format: "v2." + Base64(salt + IV + ciphertext)
        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);
        
        return 'v2.' + btoa(String.fromCharCode.apply(null, combined));
    },

    async decryptAES(base64Data, password) {
        const isV2 = typeof base64Data === 'string' && base64Data.startsWith('v2.');
        const payload = isV2 ? base64Data.slice(3) : base64Data;
        const combined = new Uint8Array(atob(payload).split('').map(c => c.charCodeAt(0)));
        const legacySalt = new TextEncoder().encode("CIQ_Salt_2026");
        const salt = isV2 ? combined.slice(0, 16) : legacySalt;
        const iv = isV2 ? combined.slice(16, 28) : combined.slice(0, 12);
        const data = isV2 ? combined.slice(28) : combined.slice(12);
        const key = await this._getAESKey(password, salt);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            data
        );
        return new TextDecoder().decode(decrypted);
    },

    // === RSA-OAEP Encryption (Asymmetric, E2E) ===
    async generateRSAKeyPair() {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );
        
        const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
        const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
        
        return { publicKeyJwk: pubJwk, privateKeyJwk: privJwk };
    },

    async encryptRSA(text, publicKeyJwk) {
        const publicKey = await crypto.subtle.importKey(
            "jwk",
            publicKeyJwk,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"]
        );
        // ハイブリッド暗号化: AES鍵を生成→データをAES暗号化→AES鍵をRSA暗号化
        const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const encryptedData = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(text));
        const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
        const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);
        // IV(12) + encryptedKey length(2) + encryptedKey + encryptedData を結合
        const ekBytes = new Uint8Array(encryptedKey);
        const edBytes = new Uint8Array(encryptedData);
        const combined = new Uint8Array(12 + 2 + ekBytes.length + edBytes.length);
        combined.set(iv, 0);
        combined[12] = (ekBytes.length >> 8) & 0xff;
        combined[13] = ekBytes.length & 0xff;
        combined.set(ekBytes, 14);
        combined.set(edBytes, 14 + ekBytes.length);
        return btoa(String.fromCharCode.apply(null, combined));
    },

    async decryptRSA(base64Data, privateKeyJwk) {
        const privateKey = await crypto.subtle.importKey(
            "jwk",
            privateKeyJwk,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["decrypt"]
        );
        const combined = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
        // ハイブリッド形式: IV(12) + keyLen(2) + encryptedKey + encryptedData
        const iv = combined.slice(0, 12);
        const ekLen = (combined[12] << 8) | combined[13];
        const encryptedKey = combined.slice(14, 14 + ekLen);
        const encryptedData = combined.slice(14 + ekLen);
        const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedKey);
        const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, encryptedData);
        return new TextDecoder().decode(decrypted);
    }
};
window.AppCrypto = AppCrypto;
