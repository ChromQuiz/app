// terms.js - participant terms rendering

let currentFootnotes = new Map();
let usedHeadingIds = new Set();

function slugifyHeading(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return normalized || 'section';
}

function uniqueHeadingId(value) {
    const base = slugifyHeading(value);
    let id = base;
    let index = 2;
    while (usedHeadingIds.has(id)) {
        id = `${base}-${index}`;
        index += 1;
    }
    usedHeadingIds.add(id);
    return id;
}

function slugifyFootnoteId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_-]/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'note';
}

function isSafeUrl(href) {
    return /^https?:\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('#');
}

function isSafeImageUrl(href) {
    return /^https?:\/\//i.test(href) || href.startsWith('data:image/');
}

function applyTableAlign(cell, align) {
    if (!align) return;
    if (align === 'center') cell.classList.add('terms-align-center');
    if (align === 'right') cell.classList.add('terms-align-right');
}

function appendText(parent, value) {
    const text = String(value || '');
    const re = /\[\^([^\]\s]+)\]/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
        if (match.index > lastIndex) {
            parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const key = match[1];
        const note = currentFootnotes.get(key);
        if (note) {
            const sup = document.createElement('sup');
            sup.className = 'terms-footnote-ref';
            const link = document.createElement('a');
            link.href = `#fn-${note.slug}`;
            link.id = `fnref-${note.slug}`;
            link.textContent = String(note.index);
            sup.appendChild(link);
            parent.appendChild(sup);
        } else {
            parent.appendChild(document.createTextNode(match[0]));
        }
        lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
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
            if (isSafeUrl(href)) {
                link.href = href;
                if (!href.startsWith('#')) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
                if (token.title) link.title = token.title;
            }
            parent.appendChild(link);
        } else if (token.type === 'url' || token.type === 'autolink') {
            const href = String(token.href || token.text || '');
            const link = document.createElement('a');
            link.textContent = token.text || href;
            if (isSafeUrl(href)) {
                link.href = href;
                if (!href.startsWith('#')) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
            }
            parent.appendChild(link);
        } else if (token.type === 'image') {
            const href = String(token.href || '');
            if (isSafeImageUrl(href)) {
                const image = document.createElement('img');
                image.src = href;
                image.alt = token.text || '';
                if (token.title) image.title = token.title;
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
        h.id = uniqueHeadingId(h.textContent || token.text || '');
        parent.appendChild(h);
        return;
    }

    if (token.type === 'html') {
        const pre = document.createElement('pre');
        pre.className = 'terms-escaped-html';
        const code = document.createElement('code');
        code.textContent = token.text || token.raw || '';
        pre.appendChild(code);
        parent.appendChild(pre);
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
        (token.header || []).forEach((cell, index) => {
            const th = document.createElement('th');
            applyTableAlign(th, token.align?.[index]);
            appendInlineTokens(th, cell.tokens || []);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        (token.rows || []).forEach((row) => {
            const tr = document.createElement('tr');
            row.forEach((cell, index) => {
                const td = document.createElement('td');
                applyTableAlign(td, token.align?.[index]);
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

function extractFootnotes(markdown) {
    const notes = new Map();
    const output = [];
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    let active = null;
    for (const line of lines) {
        const match = line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
        if (match) {
            active = match[1];
            notes.set(active, [match[2]]);
            continue;
        }
        if (active && /^( {2,}|\t)\S/.test(line)) {
            notes.get(active).push(line.replace(/^( {2,}|\t)/, ''));
            continue;
        }
        active = null;
        output.push(line);
    }
    const footnotes = new Map();
    Array.from(notes.entries()).forEach(([key, noteLines], index) => {
        footnotes.set(key, {
            index: index + 1,
            slug: slugifyFootnoteId(key),
            markdown: noteLines.join('\n').trim(),
        });
    });
    return { markdown: output.join('\n'), footnotes };
}

function appendFootnotes(parent) {
    const notes = Array.from(currentFootnotes.values());
    if (!notes.length) return;
    const section = document.createElement('section');
    section.className = 'terms-footnotes';
    section.setAttribute('aria-label', '脚注');
    const heading = document.createElement('h2');
    heading.textContent = '脚注';
    section.appendChild(heading);
    const list = document.createElement('ol');
    notes.forEach((note) => {
        const item = document.createElement('li');
        item.id = `fn-${note.slug}`;
        const fragment = document.createElement('div');
        const tokens = window.marked?.lexer ? marked.lexer(note.markdown || '') : [];
        tokens.forEach(token => appendBlockToken(fragment, token));
        item.append(...Array.from(fragment.childNodes));
        const back = document.createElement('a');
        back.className = 'terms-footnote-back';
        back.href = `#fnref-${note.slug}`;
        back.textContent = '戻る';
        item.appendChild(back);
        list.appendChild(item);
    });
    section.appendChild(list);
    parent.appendChild(section);
}

function appendDefinitionList(parent, terms) {
    const dl = document.createElement('dl');
    dl.className = 'terms-definition-list';
    terms.forEach((item) => {
        const dt = document.createElement('dt');
        dt.textContent = item.term;
        const dd = document.createElement('dd');
        const tokens = window.marked?.lexer ? marked.lexer(item.definition || '') : [];
        if (tokens.length) {
            tokens.forEach(token => appendBlockToken(dd, token));
        } else {
            dd.textContent = item.definition || '';
        }
        dl.append(dt, dd);
    });
    parent.appendChild(dl);
}

function renderDefinitionLists(container) {
    const paragraphs = Array.from(container.querySelectorAll(':scope > p'));
    paragraphs.forEach((paragraph) => {
        const lines = (paragraph.textContent || '').split('\n');
        const terms = [];
        for (let i = 0; i < lines.length; i += 2) {
            if (!lines[i] || !lines[i + 1]?.startsWith(': ')) return;
            terms.push({ term: lines[i], definition: lines[i + 1].slice(2) });
        }
        if (!terms.length) return;
        const holder = document.createElement('div');
        appendDefinitionList(holder, terms);
        paragraph.replaceWith(holder.firstChild);
    });
}

function renderMarkdown(container, markdown) {
    container.textContent = '';
    usedHeadingIds = new Set();
    const prepared = extractFootnotes(markdown || '');
    currentFootnotes = prepared.footnotes;
    if (window.marked?.setOptions) {
        marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });
    }
    const tokens = window.marked?.lexer ? marked.lexer(prepared.markdown || '') : [];
    tokens.forEach(token => appendBlockToken(container, token));
    renderDefinitionLists(container);
    appendFootnotes(container);
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
        if (!heading.id) heading.id = `terms-section-${index + 1}`;
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
