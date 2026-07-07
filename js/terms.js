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
        } else if (token.type === 'del') {
            const el = document.createElement('del');
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
        } else if (token.type === 'image') {
            const href = String(token.href || '');
            if (/^https?:\/\//i.test(href) || href.startsWith('data:image/')) {
                const image = document.createElement('img');
                image.src = href;
                image.alt = token.text || '';
                image.loading = 'lazy';
                image.decoding = 'async';
                parent.appendChild(image);
            } else {
                appendText(parent, token.text || '');
            }
        } else if (token.type === 'html') {
            appendText(parent, token.text || token.raw || '');
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
            if (item.task) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(item.checked);
                checkbox.disabled = true;
                checkbox.className = 'terms-task-checkbox';
                li.appendChild(checkbox);
            }
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
        if (token.lang) pre.dataset.lang = String(token.lang);
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

    if (token.type === 'table') {
        const wrap = document.createElement('div');
        wrap.className = 'terms-table-wrap';
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        (token.header || []).forEach((cell) => {
            const th = document.createElement('th');
            appendInlineTokens(th, cell.tokens || []);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        (token.rows || []).forEach((row) => {
            const tr = document.createElement('tr');
            row.forEach((cell) => {
                const td = document.createElement('td');
                appendInlineTokens(td, cell.tokens || []);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        parent.appendChild(wrap);
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
    renderTermsToc(container);
}

function renderTermsToc(container) {
    const toc = document.getElementById('terms-toc');
    if (!toc) return;
    toc.textContent = '';
    const headings = Array.from(container.querySelectorAll('h1, h2, h3'));
    if (headings.length < 2) {
        toc.classList.add('u-hidden');
        return;
    }
    const title = document.createElement('div');
    title.className = 'terms-toc-title';
    title.textContent = '目次';
    const list = document.createElement('ol');
    headings.forEach((heading, index) => {
        heading.id = `terms-section-${index + 1}`;
        const item = document.createElement('li');
        item.className = `terms-toc-depth-${heading.tagName.slice(1)}`;
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent || `項目${index + 1}`;
        item.appendChild(link);
        list.appendChild(item);
    });
    toc.append(title, list);
    toc.classList.remove('u-hidden');
}

function setTermsMessage(container, message) {
    document.getElementById('terms-toc')?.classList.add('u-hidden');
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
