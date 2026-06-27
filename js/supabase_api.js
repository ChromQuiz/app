/**
 * CIQ Supabase API adapter.
 */

const CIQSupabaseAPI = {
    isEnabled() {
        const cfg = window.CIQ_SUPABASE_CONFIG;
        return Boolean(
            cfg?.url &&
            cfg?.publishableKey &&
            !String(cfg.url).includes('YOUR_PROJECT_REF') &&
            !String(cfg.publishableKey).includes('YOUR_SUPABASE_PUBLISHABLE_KEY') &&
            window.CIQSupabase?.getClient
        );
    },

    client() {
        if (!this.isEnabled()) {
            throw new Error('Supabase is not configured.');
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
            : new URL('index.html', location.href).href;
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
        if (!res.ok) throw new Error(data?.error || `${name} failed`);
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
            .select('*')
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
            replyTo: data.reply_to,
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

    subscribePublicEntries(projectId, callback) {
        const client = this.client();
        let active = true;

        this.getPublicEntries(projectId).then((entries) => {
            if (active) callback(entries);
        }).catch((error) => {
            console.error('Supabase public entry list load error:', error);
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
            if (error.message?.includes('Invalid scorer code')) throw new Error('プロジェクトIDまたは採点者コードが正しくありません。');
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
                project_members!inner(role, display_name, status)
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
            .from('entries')
            .select('id, entry_number, encrypted_pii, email_hash, entry_name, affiliation, grade, message, is_chubu, status, checked_in, created_at, waitlist_promoted_at, waitlist_promotion_notice')
            .eq('project_id', projectId)
            .order('entry_number', { ascending: true });
        if (error) throw error;
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

    async uploadAnswerPage(projectId, entryNumber, pageDataUrl, cells, pageWidth) {
        const entry = await this.findEntryByNumber(projectId, entryNumber);
        if (!entry) throw new Error(`受付番号 ${entryNumber} の参加者が見つかりません。`);

        const pagePath = `${projectId}/${entryNumber}/page.webp`;
        const pageBlob = this.dataUrlToBlob(pageDataUrl);
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
        return data;
    },

    async uploadAnswerCell(projectId, entryNumber, questionNumber, cellDataUrl) {
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
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        return data;
    },

    async listAnswerPages(projectId) {
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
        return (data || []).sort((a, b) => Number(a.entries?.entry_number || 0) - Number(b.entries?.entry_number || 0));
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

    async getAnswerCellUrl(projectId, entryNumber, questionNumber, expiresIn = 3600) {
        const path = `${projectId}/${entryNumber}/q${questionNumber}.webp`;
        const { data, error } = await this.client()
            .storage
            .from('answer-cells')
            .createSignedUrl(path, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    },

    async deleteAnswerPage(projectId, entryNumber) {
        const page = await this.getAnswerPageByEntryNumber(projectId, entryNumber);
        if (!page) return;
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
        const pages = await this.listAnswerPages(projectId);
        const cards = await Promise.all(pages.map(async (page) => {
            const entry = page.entries || {};
            const entryNumber = Number(entry.entry_number);
            let cellUrl = null;
            try {
                cellUrl = await this.getAnswerCellUrl(projectId, entryNumber, questionNumber);
            } catch (_) {
                cellUrl = null;
            }
            return {
                entryId: page.entry_id,
                entryNumber,
                displayName: entry.entry_name || `No.${String(entryNumber).padStart(3, '0')}`,
                affiliation: entry.affiliation || '',
                grade: entry.grade || '',
                cellUrl,
            };
        }));
        return cards.filter(card => card.entryId && card.entryNumber).sort((a, b) => a.entryNumber - b.entryNumber);
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

    async listQuestionScoreVotes(projectId, questionNumber) {
        const { data, error } = await this.client()
            .from('score_votes')
            .select('entry_id, scorer_member_id, result')
            .eq('project_id', projectId)
            .eq('question_number', questionNumber);
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
