// terms.js - participant terms rendering

function appendText(parent, value) {
    parent.appendChild(document.createTextNode(value || ''));
}

function appendInlineTokens(parent, tokens = []) {
    tokens.forEach((token) => {
        if (token.type === 'text' || token.type === 'escape') {
            appendText(parent, token.text || token.raw || '');
        } else if (token.type === 'strong' || token.type === 'em') {
            const el = document.createElement(token.type === 'strong' ? 'strong' : 'em');
            appendInlineTokens(el, token.tokens || []);
            parent.appendChild(el);
        } else if (token.type === 'codespan') {
            const code = document.createElement('code');
            code.textContent = token.text || '';
            parent.appendChild(code);
        } else if (token.type === 'br') {
            parent.appendChild(document.createElement('br'));
        } else if (token.type === 'link') {
            const href = String(token.href || '');
            const link = document.createElement('a');
            link.textContent = token.text || href;
            if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
                link.href = href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            parent.appendChild(link);
        } else if (token.tokens) {
            appendInlineTokens(parent, token.tokens);
        } else {
            appendText(parent, token.text || token.raw || '');
        }
    });
}

function appendBlockToken(parent, token) {
    if (token.type === 'space') return;

    if (token.type === 'heading') {
        const level = Math.min(Math.max(Number(token.depth) || 2, 1), 4);
        const h = document.createElement(`h${level}`);
        appendInlineTokens(h, token.tokens || []);
        parent.appendChild(h);
        return;
    }

    if (token.type === 'paragraph') {
        const p = document.createElement('p');
        appendInlineTokens(p, token.tokens || []);
        parent.appendChild(p);
        return;
    }

    if (token.type === 'list') {
        const list = document.createElement(token.ordered ? 'ol' : 'ul');
        (token.items || []).forEach((item) => {
            const li = document.createElement('li');
            if (item.tokens?.length) {
                item.tokens.forEach(child => appendBlockToken(li, child));
            } else {
                appendInlineTokens(li, item.tokens || []);
            }
            list.appendChild(li);
        });
        parent.appendChild(list);
        return;
    }

    if (token.type === 'blockquote') {
        const blockquote = document.createElement('blockquote');
        (token.tokens || []).forEach(child => appendBlockToken(blockquote, child));
        parent.appendChild(blockquote);
        return;
    }

    if (token.type === 'code') {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = token.text || '';
        pre.appendChild(code);
        parent.appendChild(pre);
        return;
    }

    if (token.type === 'hr') {
        parent.appendChild(document.createElement('hr'));
        return;
    }

    const p = document.createElement('p');
    p.textContent = token.text || token.raw || '';
    parent.appendChild(p);
}

function renderMarkdown(container, markdown) {
    container.textContent = '';
    const tokens = window.marked?.lexer ? marked.lexer(markdown || '') : [];
    tokens.forEach(token => appendBlockToken(container, token));
}

function setTermsMessage(container, message) {
    container.textContent = '';
    const p = document.createElement('p');
    p.textContent = message;
    container.appendChild(p);
}

async function loadTerms() {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('pid');
    const container = document.getElementById('terms-content');

    if (!projectId) {
        setTermsMessage(container, 'プロジェクトIDが指定されていません。');
        return;
    }

    try {
        if (!window.CIQSupabaseAPI?.isEnabled?.()) {
            throw new Error('Supabase設定が見つかりません。');
        }
        const settings = await CIQSupabaseAPI.getPublicSettings(projectId);
        const terms = settings?.terms;

        if (settings?.projectName) {
            document.getElementById('page-title').textContent = settings.projectName;
            document.title = `参加規約 - ${settings.projectName}`;
        } else {
            document.getElementById('page-title').textContent = '参加規約';
        }

        if (terms) {
            renderMarkdown(container, terms);
        } else {
            setTermsMessage(container, '現在、参加規約は設定されていません。');
        }
    } catch (err) {
        setTermsMessage(container, '参加規約の取得に失敗しました。通信環境をご確認の上、再度お試しください。');
        console.error(err);
    }
}

document.addEventListener('DOMContentLoaded', loadTerms);
