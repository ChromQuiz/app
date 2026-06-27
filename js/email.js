// email.js - CIQ Supabase Edge Function mail client.

const CIQEmail = (() => {
    let _endpoint = '';
    let _publishableKey = '';

    function defaultProjectId() {
        return new URLSearchParams(location.search).get('pid') || session.get('projectId') || null;
    }

    function configure(config = {}) {
        const supabaseConfig = window.CIQ_SUPABASE_CONFIG || {};
        const baseUrl = (config.endpoint || supabaseConfig.url || '').replace(/\/$/, '');
        _endpoint = baseUrl.includes('/functions/v1/send-email')
            ? baseUrl
            : baseUrl ? `${baseUrl}/functions/v1/send-email` : '';
        _publishableKey = config.publishableKey || config.apiKey || supabaseConfig.publishableKey || '';
    }

    function ensureConfigured() {
        if (!_endpoint || !_publishableKey) configure();
        return Boolean(_endpoint && _publishableKey);
    }

    async function request(type, to, data = {}) {
        if (!ensureConfigured()) {
            console.warn('[CIQEmail] Supabaseメール設定が見つかりません。');
            return null;
        }
        const projectId = data.projectId || defaultProjectId();
        const res = await fetch(_endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                apikey: _publishableKey,
            },
            body: JSON.stringify({ type, to, projectId, data }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error('[CIQEmail] 送信失敗:', result);
            return null;
        }
        return result;
    }

    async function sendEntryConfirmation(to, { projectName, entryNumber, password, uuid, emailHash, familyName, firstName, status, editUrl, senderName, replyTo }) {
        const result = await request('entry_confirmation', to, {
            projectName, entryNumber, password, uuid, emailHash, familyName, firstName, status, editUrl, senderName, replyTo,
            entryId: uuid,
        });
        return Boolean(result?.success);
    }

    async function sendCancellation(to, { projectName, entryNumber, entryId, emailHash, familyName, firstName, senderName, replyTo }) {
        const result = await request('entry_cancelled', to, {
            projectName, entryNumber, entryId, emailHash, familyName, firstName, senderName, replyTo,
        });
        return Boolean(result?.success);
    }

    async function sendWaitlistPromotion(to, { projectName, entryNumber, entryId, emailHash, familyName, firstName, senderName, replyTo }) {
        const result = await request('waitlist_promoted', to, {
            projectName, entryNumber, entryId, emailHash, familyName, firstName, senderName, replyTo,
        });
        return Boolean(result?.success);
    }

    async function sendVerificationCode(to, projectName, senderName, replyTo) {
        const result = await request('send_verification', to, { projectName, senderName, replyTo });
        if (!result?.success) return null;
        return result;
    }

    async function verifyCode(email, code, signature, expiresAt) {
        const result = await request('verify_code', email, { code, signature, expiresAt });
        return result?.verified === true;
    }

    return { configure, sendEntryConfirmation, sendCancellation, sendWaitlistPromotion, sendVerificationCode, verifyCode };
})();
