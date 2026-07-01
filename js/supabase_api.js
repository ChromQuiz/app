/**
 * CIQ Supabase API adapter.
 */

const CIQSupabaseAPI = {
    _cache: new Map(),
    _imageCache: new Map(),
    _imageBitmapCache: new Map(),
    _cropUrlCache: new Map(),
    _cropPromiseCache: new Map(),
    _imageCacheLimit: 80,
    _imageBitmapCacheLimit: 50,
    _cropUrlCacheLimit: 400,
    _imagePerfStats: {
        cropUrlHits: 0,
        cropPromiseHits: 0,
        cropMisses: 0,
        cropErrors: 0,
    },
    _answerPagesCacheMs: 15000,
    _signedUrlCacheMs: 5 * 60 * 1000,

    getCachedValue(key) {
        const cached = this._cache.get(key);
        if (!cached) return null;
        if (cached.expiresAt <= Date.now()) {
            this._cache.delete(key);
            return null;
        }
        return cached.value;
    },

    setCachedValue(key, value, ttlMs) {
        this._cache.set(key, {
            value,
            expiresAt: Date.now() + Math.max(0, ttlMs),
        });
        return value;
    },

    invalidateProjectAnswerCache(projectId) {
        const prefix = `${projectId}:`;
        Array.from(this._cache.keys()).forEach(key => {
            if (String(key).startsWith(prefix)) this._cache.delete(key);
        });
        this.clearCropUrlCache();
    },

    clearCropUrlCache() {
        this._cropUrlCache.forEach((url) => {
            if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        this._cropUrlCache.clear();
        this._cropPromiseCache.clear();
    },

    releaseImageCaches() {
        this.clearCropUrlCache();
        this._imageBitmapCache.forEach((bitmapPromise) => {
            Promise.resolve(bitmapPromise).then(bitmap => bitmap?.close?.()).catch(() => {});
        });
        this._imageBitmapCache.clear();
        this._imageCache.clear();
    },

    getImagePerfStats() {
        return {
            ...this._imagePerfStats,
            cropUrlCacheSize: this._cropUrlCache.size,
            cropPromiseCacheSize: this._cropPromiseCache.size,
            pageImageCacheSize: this._imageCache.size,
            pageBitmapCacheSize: this._imageBitmapCache.size,
        };
    },

    takeImagePerfStats(previous = null) {
        const current = this.getImagePerfStats();
        if (!previous) return current;
        return {
            cropUrlHits: current.cropUrlHits - (previous.cropUrlHits || 0),
            cropPromiseHits: current.cropPromiseHits - (previous.cropPromiseHits || 0),
            cropMisses: current.cropMisses - (previous.cropMisses || 0),
            cropErrors: current.cropErrors - (previous.cropErrors || 0),
            cropUrlCacheSize: current.cropUrlCacheSize,
            cropPromiseCacheSize: current.cropPromiseCacheSize,
            pageImageCacheSize: current.pageImageCacheSize,
            pageBitmapCacheSize: current.pageBitmapCacheSize,
        };
    },

    getConfigStatus() {
        const cfg = window.CIQ_SUPABASE_CONFIG;
        if (!cfg) return { ok: false, reason: 'missing-config' };
        if (!cfg.url || String(cfg.url).includes('YOUR_PROJECT_REF')) {
            return { ok: false, reason: 'missing-url' };
        }
        if (!cfg.publishableKey || String(cfg.publishableKey).includes('YOUR_SUPABASE_PUBLISHABLE_KEY')) {
            return { ok: false, reason: 'missing-key' };
        }
        if (!window.supabase?.createClient) {
            return { ok: false, reason: 'missing-sdk' };
        }
        if (!window.CIQSupabase?.getClient) {
            return { ok: false, reason: 'missing-client' };
        }
        return { ok: true, reason: '' };
    },

    getConfigErrorMessage() {
        const status = this.getConfigStatus();
        if (status.ok) return '';
        if (status.reason === 'missing-sdk') {
            return 'Supabase SDKを読み込めませんでした。ネットワーク接続を確認して、https://chromquiz.github.io/app/ から開き直してください。';
        }
        if (status.reason === 'missing-client') {
            return 'Supabaseクライアントを読み込めませんでした。ページを再読み込みしてください。';
        }
        return 'Supabase設定が見つかりません。js/supabase_config.js を確認してください。';
    },

    isEnabled() {
        return this.getConfigStatus().ok;
    },

    client() {
        if (!this.isEnabled()) {
            throw new Error(this.getConfigErrorMessage() || 'Supabase is not configured.');
        }
        return window.CIQSupabase.getClient();
    },

    async getSession() {
        const { data, error } = await this.client().auth.getSession();
        if (error) throw error;
        return data.session;
    },

    onAuthStateChange(callback) {
        return this.client().auth.onAuthStateChange((_event, session) => callback(session));
    },

    async signInWithGoogle() {
        const redirectTo = location.protocol === 'file:'
            ? undefined
            : new URL(location.pathname.split('/').pop() || 'index.html', location.href).href;
        const { error } = await this.client().auth.signInWithOAuth({
            provider: 'google',
            options: redirectTo ? { redirectTo } : undefined,
        });
        if (error) throw error;
    },

    async signOut() {
        const { error } = await this.client().auth.signOut();
        if (error) throw error;
    },

    async invokePublicFunction(name, payload) {
        const cfg = window.CIQ_SUPABASE_CONFIG;
        const res = await fetch(`${cfg.url.replace(/\/$/, '')}/functions/v1/${name}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                apikey: cfg.publishableKey,
            },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const error = new Error(data?.error || `${name} failed`);
            error.status = res.status;
            error.functionName = name;
            throw error;
        }
        return data;
    },

    async invokeAuthedFunction(name, payload) {
        const cfg = window.CIQ_SUPABASE_CONFIG;
        const session = await this.getSession();
        if (!session?.access_token) throw new Error('Googleログインが必要です。');
        const res = await fetch(`${cfg.url.replace(/\/$/, '')}/functions/v1/${name}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                apikey: cfg.publishableKey,
                authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `${name} failed`);
        return data;
    },

    async getPublicSettings(projectId) {
        const { data, error } = await this.client()
            .from('public_project_settings')
            .select('project_id, project_name, rsa_public_key, entry_open, period_start, period_end, max_entries, disclosure_enabled, disclosure_period_start, disclosure_period_end, terms')
            .eq('project_id', projectId)
            .single();

        if (error) throw error;
        if (!data) return null;

        return {
            projectName: data.project_name,
            publicKey: data.rsa_public_key,
            entryOpen: data.entry_open,
            periodStart: data.period_start,
            periodEnd: data.period_end,
            maxEntries: data.max_entries || 0,
            disclosureOpen: data.disclosure_enabled,
            disclosurePeriodStart: data.disclosure_period_start,
            disclosurePeriodEnd: data.disclosure_period_end,
            terms: data.terms,
        };
    },

    mapPublicEntry(row) {
        return {
            uuid: row.entry_id,
            entryNumber: row.entry_number,
            entryName: row.entry_name,
            affiliation: row.affiliation,
            grade: row.grade,
            message: row.message,
            isChubu: row.is_chubu,
            status: row.status,
            checkedIn: row.checked_in,
            timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
        };
    },

    async getPublicEntries(projectId) {
        const { data, error } = await this.client()
            .from('public_entry_list')
            .select('entry_id, entry_number, entry_name, affiliation, grade, message, is_chubu, status, checked_in, created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true })
            .order('entry_number', { ascending: true });

        if (error) throw error;

        const entries = {};
        for (const row of data || []) {
            entries[row.entry_id] = this.mapPublicEntry(row);
        }
        return entries;
    },

    subscribePublicEntries(projectId, callback, onError = null) {
        const client = this.client();
        let active = true;

        this.getPublicEntries(projectId).then((entries) => {
            if (active) callback(entries);
        }).catch((error) => {
            console.error('Supabase public entry list load error:', error);
            if (active && onError) onError(error);
        });

        const channel = client
            .channel(`public-entry-list:${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'public_entry_list',
                    filter: `project_id=eq.${projectId}`,
                },
                async () => {
                    try {
                        const entries = await this.getPublicEntries(projectId);
                        if (active) callback(entries);
                    } catch (error) {
                        console.error('Supabase public entry list refresh error:', error);
                        if (active && onError) onError(error);
                    }
                }
            )
            .subscribe();

        return {
            stop() {
                active = false;
                client.removeChannel(channel);
            },
        };
    },

    async createEntry(payload) {
        const data = await this.invokePublicFunction('create-entry', payload);
        if (!data?.ok) throw new Error(data?.error || 'Entry failed');
        return data.entry;
    },

    async cancelEntry(payload) {
        const data = await this.invokePublicFunction('cancel-entry', payload);
        if (!data?.ok) throw new Error(data?.error || 'Cancel failed');
        return data;
    },

    async discloseResult(payload) {
        const data = await this.invokePublicFunction('disclose-result', payload);
        if (!data?.ok) throw new Error(data?.error || 'Disclosure failed');
        return data;
    },

    async editEntry(payload) {
        const data = await this.invokePublicFunction('edit-entry', payload);
        if (!data?.ok) throw new Error(data?.error || 'Edit failed');
        return data;
    },

    async markLate(payload) {
        const data = await this.invokePublicFunction('mark-late', payload);
        if (!data?.ok) throw new Error(data?.error || 'Late report failed');
        return data;
    },

    async getCheckInStats(projectId) {
        const data = await this.invokeAuthedFunction('check-in', {
            action: 'stats',
            projectId,
        });
        if (!data?.ok) throw new Error(data?.error || 'Check-in stats failed');
        return data.stats;
    },

    async checkInEntry(projectId, entryId) {
        const data = await this.invokeAuthedFunction('check-in', {
            action: 'check',
            projectId,
            entryId,
        });
        if (!data?.ok) throw new Error(data?.error || 'Check-in failed');
        return data;
    },

    async storeProjectPrivateKey(projectId, privateKeyJwk) {
        const data = await this.invokeAuthedFunction('project-key', {
            action: 'store',
            projectId,
            privateKeyJwk,
        });
        if (!data?.ok) throw new Error(data?.error || 'Project key store failed');
        return data;
    },

    async fetchProjectPrivateKey(projectId) {
        const data = await this.invokeAuthedFunction('project-key', {
            action: 'fetch',
            projectId,
        });
        if (!data?.ok || !data.privateKeyJwk) throw new Error(data?.error || 'Project key fetch failed');
        return data.privateKeyJwk;
    },

    async createProjectWithOwner(payload) {
        const { data, error } = await this.client()
            .rpc('create_project_with_owner', {
                p_project_id: payload.projectId,
                p_name: payload.name,
                p_rsa_public_key: payload.publicKey,
                p_rsa_private_key_encrypted: payload.encryptedPrivateKey,
                p_owner_display_name: payload.ownerDisplayName,
                p_scorer_access_code_hash: payload.scorerAccessCodeHash,
            })
            .single();
        if (error) {
            if (error.code === '23505') throw new Error(`プロジェクト "${payload.projectId}" は既に存在します。別の回数を指定してください。`);
            throw error;
        }
        return data;
    },

    async joinProjectWithScorerCode(projectId, accessCodeHash) {
        const { data, error } = await this.client()
            .rpc('join_project_with_scorer_code', {
                p_project_id: projectId,
                p_access_code_hash: accessCodeHash,
            })
            .single();
        if (error) {
            if (error.message?.includes('Invalid scorer code')) throw new Error('プロジェクトIDまたはパスワードが正しくありません。');
            if (error.message?.includes('Project not found')) throw new Error('プロジェクトが見つかりません。');
            throw error;
        }
        return data;
    },

    async listMyProjects() {
        const { data, error } = await this.client()
            .from('projects')
            .select(`
                id,
                name,
                updated_at,
                project_members!project_members_project_id_fkey!inner(role, display_name, status)
            `)
            .eq('project_members.status', 'active')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((project) => ({
            id: project.id,
            name: project.name,
            updatedAt: project.updated_at,
            role: project.project_members?.[0]?.role || '',
            displayName: project.project_members?.[0]?.display_name || '',
        }));
    },

    async listProjectMembers(projectId) {
        const { data, error } = await this.client()
            .from('project_members')
            .select('id, user_id, invited_email, role, display_name, status, created_at')
            .eq('project_id', projectId)
            .order('status', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async updateProjectMemberRole(memberId, role) {
        const { data, error } = await this.client()
            .rpc('update_project_member_role', {
                p_member_id: memberId,
                p_role: role,
            })
            .single();
        if (error) throw error;
        return data;
    },

    async removeProjectMember(memberId) {
        const { data, error } = await this.client()
            .rpc('remove_project_member', { p_member_id: memberId })
            .single();
        if (error) throw error;
        return data;
    },

    async restoreProjectMember(memberId) {
        const { data, error } = await this.client()
            .rpc('restore_project_member', { p_member_id: memberId })
            .single();
        if (error) throw error;
        return data;
    },

    async getProject(projectId) {
        const { data, error } = await this.client()
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();
        if (error) throw error;
        return data;
    },

    async updateProject(projectId, patch) {
        const { data, error } = await this.client()
            .from('projects')
            .update(patch)
            .eq('id', projectId)
            .select('*')
            .single();
        if (error) throw error;
        return data;
    },

    async listEntriesForAdmin(projectId) {
        const { data, error } = await this.client()
            .rpc('list_entries_for_admin', { p_project_id: projectId });
        if (error) {
            const message = error.message || String(error);
            const isMissingRpc = error.code === 'PGRST202'
                || message.includes('Could not find the function')
                || message.includes('schema cache');
            if (!isMissingRpc) throw error;

            console.warn('[CIQ upload debug] listEntriesForAdmin:fallbackDirectSelect', {
                projectId,
                code: error.code || null,
                message,
            });
            const { data: fallbackData, error: fallbackError } = await this.client()
                .from('entries')
                .select('id, project_id, entry_number, entry_name, affiliation, grade, message, is_chubu, status, checked_in, created_at, updated_at, waitlist_promoted_at, waitlist_promotion_notice')
                .eq('project_id', projectId)
                .order('entry_number', { ascending: true });
            if (fallbackError) throw fallbackError;
            return fallbackData || [];
        }
        return data || [];
    },

    async updateEntryNoticeState(entryId, noticeState) {
        const { data, error } = await this.client()
            .from('entries')
            .update({ waitlist_promotion_notice: noticeState })
            .eq('id', entryId)
            .select('id, waitlist_promotion_notice')
            .single();
        if (error) throw error;
        return data;
    },

    async listModelAnswers(projectId) {
        const { data, error } = await this.client()
            .from('model_answers')
            .select('question_number, answer')
            .eq('project_id', projectId)
            .order('question_number', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async saveModelAnswers(projectId, answers) {
        const client = this.client();
        const { error: deleteError } = await client
            .from('model_answers')
            .delete()
            .eq('project_id', projectId);
        if (deleteError) throw deleteError;

        const rows = (answers || [])
            .map((answer, index) => ({
                project_id: projectId,
                question_number: index + 1,
                answer: String(answer || '').trim(),
            }))
            .filter(row => row.answer);

        if (rows.length === 0) return [];
        const { data, error } = await client
            .from('model_answers')
            .upsert(rows, { onConflict: 'project_id,question_number' })
            .select('question_number, answer');
        if (error) throw error;
        return data || [];
    },

    dataUrlToBlob(dataUrl) {
        const [meta, data] = String(dataUrl).split(',');
        const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
        const binary = atob(data || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    },

    toUploadBlob(source, fallbackType = 'image/webp') {
        if (source instanceof Blob) return source;
        if (typeof source === 'string' && source.startsWith('data:')) return this.dataUrlToBlob(source);
        throw new Error('Invalid upload image data');
    },

    async uploadAnswerPage(projectId, entryNumber, pageImage, cells, pageWidth, knownEntry = null) {
        const entry = knownEntry?.id ? knownEntry : await this.findEntryByNumber(projectId, entryNumber);
        if (!entry) throw new Error(`受付番号 ${entryNumber} の参加者が見つかりません。`);

        const pagePath = `${projectId}/${entryNumber}/page.webp`;
        const pageBlob = this.toUploadBlob(pageImage, 'image/webp');
        const { error: pageError } = await this.client()
            .storage
            .from('answer-pages')
            .upload(pagePath, pageBlob, {
                contentType: pageBlob.type || 'image/webp',
                upsert: true,
            });
        if (pageError) throw pageError;

        const { data, error } = await this.client()
            .from('answer_pages')
            .upsert({
                project_id: projectId,
                entry_id: entry.id,
                storage_path: pagePath,
                cells: {
                    regions: cells || {},
                    pageWidth: pageWidth || null,
                },
            }, { onConflict: 'project_id,entry_id' })
            .select('id, project_id, entry_id, storage_path, cells, uploaded_at')
            .single();
        if (error) throw error;
        this.invalidateProjectAnswerCache(projectId);
        return data;
    },

    async uploadAnswerCell(projectId, entryNumber, questionNumber, cellDataUrl, invalidateCache = true) {
        const path = `${projectId}/${entryNumber}/q${questionNumber}.webp`;
        const blob = this.dataUrlToBlob(cellDataUrl);
        const { error } = await this.client()
            .storage
            .from('answer-cells')
            .upload(path, blob, {
                contentType: blob.type || 'image/webp',
                upsert: true,
            });
        if (error) throw error;
        if (invalidateCache) this.invalidateProjectAnswerCache(projectId);
        return path;
    },

    async findEntryByNumber(projectId, entryNumber) {
        const { data, error } = await this.client()
            .from('entries')
            .select('id, entry_number, entry_name, affiliation, grade, status, checked_in')
            .eq('project_id', projectId)
            .eq('entry_number', entryNumber)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                console.warn('[CIQ upload debug] findEntryByNumber:notFound', { projectId, entryNumber });
                return null;
            }
            console.warn('[CIQ upload debug] findEntryByNumber:error', {
                projectId,
                entryNumber,
                code: error.code || null,
                message: error.message || String(error),
            });
            throw error;
        }
        return data;
    },

    async listAnswerPages(projectId) {
        const cacheKey = `${projectId}:answer-pages`;
        const cached = this.getCachedValue(cacheKey);
        if (cached) return cached;

        const { data, error } = await this.client()
            .from('answer_pages')
            .select(`
                id,
                entry_id,
                storage_path,
                cells,
                uploaded_at,
                entries!inner(entry_number, entry_name, affiliation, grade)
            `)
            .eq('project_id', projectId);
        if (error) throw error;
        const pages = (data || []).sort((a, b) => Number(a.entries?.entry_number || 0) - Number(b.entries?.entry_number || 0));
        return this.setCachedValue(cacheKey, pages, this._answerPagesCacheMs);
    },

    async getAnswerPageByEntryNumber(projectId, entryNumber) {
        const entry = await this.findEntryByNumber(projectId, entryNumber);
        if (!entry) return null;
        const { data, error } = await this.client()
            .from('answer_pages')
            .select('id, storage_path, cells, uploaded_at')
            .eq('project_id', projectId)
            .eq('entry_id', entry.id)
            .single();
        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        return { ...data, entry };
    },

    async getAnswerPageUrl(storagePath, expiresIn = 3600) {
        const { data, error } = await this.client()
            .storage
            .from('answer-pages')
            .createSignedUrl(storagePath, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    },

    async getAnswerPageUrls(projectId, requests, expiresIn = 3600) {
        const normalized = (requests || [])
            .map((request) => ({
                key: request.key,
                path: request.storagePath,
            }))
            .filter(request => request.key && request.path);
        if (!normalized.length) return {};

        const signedUrls = {};
        const missing = [];
        const ttlMs = Math.min(this._signedUrlCacheMs, Math.max(0, expiresIn * 1000 - 60000));
        for (const request of normalized) {
            const cacheKey = `${projectId}:answer-page-url:${request.path}`;
            const cachedUrl = this.getCachedValue(cacheKey);
            if (cachedUrl) {
                signedUrls[request.key] = cachedUrl;
            } else {
                missing.push({ ...request, cacheKey });
            }
        }
        if (!missing.length) return signedUrls;

        const { data, error } = await this.client()
            .storage
            .from('answer-pages')
            .createSignedUrls(missing.map(request => request.path), expiresIn);
        if (error) throw error;

        (data || []).forEach((item, index) => {
            const request = missing[index];
            if (!request) return;
            const signedUrl = item?.signedUrl || item?.signed_url || '';
            signedUrls[request.key] = signedUrl;
            if (signedUrl && ttlMs > 0) this.setCachedValue(request.cacheKey, signedUrl, ttlMs);
        });

        return signedUrls;
    },

    async getAnswerCellUrl(projectId, entryNumber, questionNumber, expiresIn = 3600) {
        const path = `${projectId}/${entryNumber}/q${questionNumber}.webp`;
        const { data, error } = await this.client()
            .storage
            .from('answer-cells')
            .createSignedUrl(path, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    },

    async getAnswerCellUrls(projectId, requests, expiresIn = 3600) {
        const normalized = (requests || [])
            .map((request) => ({
                key: request.key,
                path: `${projectId}/${request.entryNumber}/q${request.questionNumber}.webp`,
            }))
            .filter(request => request.key && request.path);
        if (!normalized.length) return {};

        const signedUrls = {};
        const missing = [];
        const ttlMs = Math.min(this._signedUrlCacheMs, Math.max(0, expiresIn * 1000 - 60000));
        for (const request of normalized) {
            const cacheKey = `${projectId}:answer-cell-url:${request.path}`;
            const cachedUrl = this.getCachedValue(cacheKey);
            if (cachedUrl) {
                signedUrls[request.key] = cachedUrl;
            } else {
                missing.push({ ...request, cacheKey });
            }
        }
        if (!missing.length) return signedUrls;

        const { data, error } = await this.client()
            .storage
            .from('answer-cells')
            .createSignedUrls(missing.map(request => request.path), expiresIn);
        if (error) throw error;

        (data || []).forEach((item, index) => {
            const request = missing[index];
            if (!request) return;
            const signedUrl = item?.signedUrl || item?.signed_url || '';
            signedUrls[request.key] = signedUrl;
            if (signedUrl && ttlMs > 0) this.setCachedValue(request.cacheKey, signedUrl, ttlMs);
        });

        return signedUrls;
    },

    async deleteAnswerPage(projectId, entryNumber) {
        const page = await this.getAnswerPageByEntryNumber(projectId, entryNumber);
        if (!page) return;
        this.invalidateProjectAnswerCache(projectId);
        const cellPaths = Object.keys(page.cells?.regions || {}).map(key => {
            const q = String(key).replace(/^q/, '');
            return `${projectId}/${entryNumber}/q${q}.webp`;
        });
        await this.client().storage.from('answer-pages').remove([page.storage_path]);
        if (cellPaths.length) await this.client().storage.from('answer-cells').remove(cellPaths);
        const { error } = await this.client()
            .from('answer_pages')
            .delete()
            .eq('id', page.id);
        if (error) throw error;
    },

    async getQuestionAnswerCards(projectId, questionNumber) {
        try {
            const { data, error } = await this.client()
                .rpc('list_question_answer_cards', {
                    p_project_id: projectId,
                    p_question_number: questionNumber,
                });
            if (error) throw error;
            return (data || [])
                .map((row) => {
                    const entryNumber = Number(row.entry_number);
                    return {
                        entryId: row.entry_id,
                        entryNumber,
                        displayName: row.entry_name || `No.${String(entryNumber).padStart(3, '0')}`,
                        affiliation: row.affiliation || '',
                        grade: row.grade || '',
                        pageUrl: null,
                        cellUrl: null,
                        storagePath: row.storage_path || null,
                        pageWidth: Number(row.page_width || 0) || null,
                        cellRegion: row.cell_region || null,
                    };
                })
                .filter(card => card.entryId && card.entryNumber);
        } catch (error) {
            console.warn('Question answer card RPC unavailable; falling back to answer_pages list.', error);
        }

        const pages = await this.listAnswerPages(projectId);
        const cards = pages.map((page) => {
            const entry = page.entries || {};
            const entryNumber = Number(entry.entry_number);
            const cellRegion = page.cells?.regions?.[`q${questionNumber}`] || null;
            return {
                entryId: page.entry_id,
                entryNumber,
                displayName: entry.entry_name || `No.${String(entryNumber).padStart(3, '0')}`,
                affiliation: entry.affiliation || '',
                grade: entry.grade || '',
                pageUrl: null,
                cellUrl: null,
                storagePath: page.storage_path || null,
                pageWidth: Number(page.cells?.pageWidth || 0) || null,
                cellRegion,
            };
        });
        return cards.filter(card => card.entryId && card.entryNumber).sort((a, b) => a.entryNumber - b.entryNumber);
    },

    loadCachedImage(imageUrl) {
        const cached = this._imageCache.get(imageUrl);
        if (cached) return cached;

        const promise = new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.decoding = 'async';
            image.onload = () => resolve(image);
            image.onerror = () => {
                this._imageCache.delete(imageUrl);
                reject(new Error('Image load failed'));
            };
            image.src = imageUrl;
        });

        this._imageCache.set(imageUrl, promise);
        while (this._imageCache.size > this._imageCacheLimit) {
            const oldestKey = this._imageCache.keys().next().value;
            this._imageCache.delete(oldestKey);
        }
        return promise;
    },

    loadCachedImageBitmap(imageUrl) {
        if (!window.createImageBitmap || !window.fetch) return null;
        const cached = this._imageBitmapCache.get(imageUrl);
        if (cached) return cached;

        const promise = fetch(imageUrl, { credentials: 'omit' })
            .then((response) => {
                if (!response.ok) throw new Error('Image fetch failed');
                return response.blob();
            })
            .then(blob => createImageBitmap(blob))
            .catch((error) => {
                this._imageBitmapCache.delete(imageUrl);
                throw error;
            });

        this._imageBitmapCache.set(imageUrl, promise);
        while (this._imageBitmapCache.size > this._imageBitmapCacheLimit) {
            const oldestKey = this._imageBitmapCache.keys().next().value;
            const oldest = this._imageBitmapCache.get(oldestKey);
            this._imageBitmapCache.delete(oldestKey);
            Promise.resolve(oldest).then(bitmap => bitmap?.close?.()).catch(() => {});
        }
        return promise;
    },

    canvasToObjectUrl(canvas, type = 'image/webp', quality = 0.64) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Image encode failed'));
                    return;
                }
                resolve(URL.createObjectURL(blob));
            }, type, quality);
        });
    },

    cropImageRegion(imageUrl, region, sourceWidth, quality = 0.64) {
        if (!imageUrl || !region) return Promise.reject(new Error('Missing image region'));
        const cropKey = [
            imageUrl,
            Number(region.x || 0),
            Number(region.y || 0),
            Number(region.w || 1),
            Number(region.h || 1),
            Number(sourceWidth || 0),
            quality,
        ].join(':');
        const cachedUrl = this._cropUrlCache.get(cropKey);
        if (cachedUrl) {
            this._imagePerfStats.cropUrlHits++;
            return Promise.resolve(cachedUrl);
        }
        const pending = this._cropPromiseCache.get(cropKey);
        if (pending) {
            this._imagePerfStats.cropPromiseHits++;
            return pending;
        }
        this._imagePerfStats.cropMisses++;

        const promise = new Promise(async (resolve, reject) => {
            try {
                let image = null;
                try {
                    image = await (this.loadCachedImageBitmap(imageUrl) || Promise.reject(new Error('ImageBitmap unavailable')));
                } catch (_) {
                    image = await this.loadCachedImage(imageUrl);
                }
                const imageWidth = image.naturalWidth || image.width;
                const imageHeight = image.naturalHeight || image.height;
                const scale = sourceWidth ? imageWidth / sourceWidth : 1;
                const x = Math.max(0, Math.round(Number(region.x || 0) * scale));
                const y = Math.max(0, Math.round(Number(region.y || 0) * scale));
                const w = Math.max(1, Math.round(Number(region.w || 1) * scale));
                const h = Math.max(1, Math.round(Number(region.h || 1) * scale));
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(w, Math.max(1, imageWidth - x));
                canvas.height = Math.min(h, Math.max(1, imageHeight - y));
                canvas.getContext('2d').drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
                const objectUrl = await this.canvasToObjectUrl(canvas, 'image/webp', quality);
                this._cropUrlCache.set(cropKey, objectUrl);
                while (this._cropUrlCache.size > this._cropUrlCacheLimit) {
                    const oldestKey = this._cropUrlCache.keys().next().value;
                    const oldestUrl = this._cropUrlCache.get(oldestKey);
                    this._cropUrlCache.delete(oldestKey);
                    if (typeof oldestUrl === 'string' && oldestUrl.startsWith('blob:')) URL.revokeObjectURL(oldestUrl);
                }
                resolve(objectUrl);
                canvas.width = 0;
                canvas.height = 0;
            } catch (error) {
                this._imagePerfStats.cropErrors++;
                reject(error);
            }
        });
        this._cropPromiseCache.set(cropKey, promise);
        promise.finally(() => this._cropPromiseCache.delete(cropKey));
        return promise;
    },

    async getModelAnswer(projectId, questionNumber) {
        const { data, error } = await this.client()
            .from('model_answers')
            .select('answer')
            .eq('project_id', projectId)
            .eq('question_number', questionNumber)
            .single();
        if (error) {
            if (error.code === 'PGRST116') return '';
            throw error;
        }
        return data?.answer || '';
    },

    async joinQuestionScorer(projectId, questionNumber) {
        const { data, error } = await this.client()
            .rpc('join_question_scorer', {
                p_project_id: projectId,
                p_question_number: questionNumber,
            })
            .single();
        if (error) {
            if (error.message?.includes('Question is full')) throw new Error('この問題は採点者が満員です。');
            throw error;
        }
        return data;
    },

    async setScoreVote(projectId, questionNumber, entryId, result) {
        const { data, error } = await this.client()
            .rpc('set_score_vote', {
                p_project_id: projectId,
                p_question_number: questionNumber,
                p_entry_id: entryId,
                p_result: result,
            })
            .single();
        if (error) throw error;
        return data;
    },

    async completeQuestionScoring(projectId, questionNumber) {
        const { data, error } = await this.client()
            .rpc('complete_question_scoring', {
                p_project_id: projectId,
                p_question_number: questionNumber,
            })
            .single();
        if (error) throw error;
        return data;
    },

    async listQuestionScorers(projectId) {
        const { data, error } = await this.client()
            .from('question_scorers')
            .select('question_number, scorer_member_id, completed_at')
            .eq('project_id', projectId);
        if (error) throw error;
        return data || [];
    },

    async listScoreVotes(projectId) {
        const { data, error } = await this.client()
            .from('score_votes')
            .select('question_number, entry_id, scorer_member_id, result')
            .eq('project_id', projectId);
        if (error) throw error;
        return data || [];
    },

    async listFinalResults(projectId) {
        const { data, error } = await this.client()
            .from('final_results')
            .select('question_number, entry_id, result, decided_by, decided_at')
            .eq('project_id', projectId);
        if (error) throw error;
        return data || [];
    },

    async listScoreConflicts(projectId) {
        const { data, error } = await this.client()
            .rpc('list_score_conflicts', {
                p_project_id: projectId,
            });
        if (error) throw error;
        return (data || []).map((row) => {
            const q = Number(row.question_number);
            const entryNumber = Number(row.entry_number);
            return {
                q,
                entryId: row.entry_id,
                entryNumber,
                displayName: row.entry_name || `No.${String(entryNumber).padStart(3, '0')}`,
                affiliation: row.affiliation || '',
                grade: row.grade || '',
                storagePath: row.storage_path || '',
                cellRegion: row.cell_region || null,
                cellRegions: {},
                pageWidth: Number(row.page_width || 0) || null,
                modelAnswer: row.model_answer || '',
                votes: Array.isArray(row.votes) ? row.votes : [],
                finalResult: row.final_result || null,
            };
        });
    },

    async listQuestionScoreVotes(projectId, questionNumber) {
        const { data, error } = await this.client()
            .from('score_votes')
            .select('entry_id, scorer_member_id, result')
            .eq('project_id', projectId)
            .eq('question_number', questionNumber);
        if (error) throw error;
        return data || [];
    },

    async listMyQuestionScoreVotes(projectId, questionNumber, scorerMemberId) {
        const { data, error } = await this.client()
            .from('score_votes')
            .select('entry_id, result')
            .eq('project_id', projectId)
            .eq('question_number', questionNumber)
            .eq('scorer_member_id', scorerMemberId);
        if (error) throw error;
        return data || [];
    },

    async resolveScoreConflict(projectId, questionNumber, entryId, result) {
        const { data, error } = await this.client()
            .rpc('resolve_score_conflict', {
                p_project_id: projectId,
                p_question_number: questionNumber,
                p_entry_id: entryId,
                p_result: result,
            })
            .single();
        if (error) throw error;
        return data;
    },

    async resetProjectData(projectId) {
        const pages = await this.listAnswerPages(projectId).catch(() => []);
        this.invalidateProjectAnswerCache(projectId);
        await Promise.all((pages || []).map(page => {
            const entryNumber = Number(page.entries?.entry_number || 0);
            return entryNumber ? this.deleteAnswerPage(projectId, entryNumber) : Promise.resolve();
        }));

        const { data, error } = await this.client()
            .rpc('reset_project_data', { p_project_id: projectId })
            .single();
        if (error) throw error;
        return data;
    },
};

window.CIQSupabaseAPI = CIQSupabaseAPI;
window.addEventListener('pagehide', (event) => {
    if (!event.persisted) CIQSupabaseAPI.releaseImageCaches();
}, { once: true });
