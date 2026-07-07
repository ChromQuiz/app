// terms.js - participant terms rendering

let currentFootnotes = new Map();
let usedHeadingIds = new Set();
let currentCustomBlocks = new Map();
let currentAbbreviations = new Map();

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

function customBlockMarker(index) {
    return `CIQ_CUSTOM_BLOCK_${index}`;
}

function parseHeadingId(text) {
    const value = String(text || '');
    const match = value.match(/\s*\{#([A-Za-z][A-Za-z0-9_-]*)\}\s*$/);
    if (!match) return { text: value, id: '' };
    return { text: value.slice(0, match.index).trim(), id: match[1] };
}

function appendAbbreviationAwareText(parent, text) {
    if (!currentAbbreviations.size) {
        parent.appendChild(document.createTextNode(text));
        return;
    }
    const keys = Array.from(currentAbbreviations.keys())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!keys.length) {
        parent.appendChild(document.createTextNode(text));
        return;
    }
    const re = new RegExp(`(${keys.join('|')})`, 'g');
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
        if (match.index > lastIndex) {
            parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const abbr = document.createElement('abbr');
        abbr.title = currentAbbreviations.get(match[0]) || '';
        abbr.textContent = match[0];
        parent.appendChild(abbr);
        lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
}

function appendRichText(parent, text) {
    const re = /(\[\^([^\]\s]+)\]|\[button:\s*([^\]\n]+)\]\(([^)\s]+)\)|\[badge:\s*([^\]\n]+)\]|\{([^{}|\n]+)\|([^{}|\n]+)\}|==([^=\n]+)==|\+\+([^+\n]+)\+\+|\^([^^\n]+)\^|~([^~\n]+)~|<kbd>([^<\n]+)<\/kbd>)/gi;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
        if (match.index > lastIndex) {
            appendAbbreviationAwareText(parent, text.slice(lastIndex, match.index));
        }
        if (match[2]) {
            const key = match[2];
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
        } else if (match[3]) {
            const href = String(match[4] || '');
            const link = document.createElement('a');
            link.className = 'terms-button-link';
            link.textContent = match[3].trim();
            if (isSafeUrl(href)) {
                link.href = href;
                if (!href.startsWith('#')) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
            }
            parent.appendChild(link);
        } else if (match[5]) {
            const badge = document.createElement('span');
            badge.className = 'terms-badge';
            badge.textContent = match[5].trim();
            parent.appendChild(badge);
        } else if (match[6]) {
            const ruby = document.createElement('ruby');
            ruby.appendChild(document.createTextNode(match[6]));
            const rt = document.createElement('rt');
            rt.textContent = match[7];
            ruby.appendChild(rt);
            parent.appendChild(ruby);
        } else if (match[8]) {
            const mark = document.createElement('mark');
            mark.textContent = match[8];
            parent.appendChild(mark);
        } else if (match[9]) {
            const ins = document.createElement('ins');
            ins.textContent = match[9];
            parent.appendChild(ins);
        } else if (match[10]) {
            const sup = document.createElement('sup');
            sup.textContent = match[10];
            parent.appendChild(sup);
        } else if (match[11]) {
            const sub = document.createElement('sub');
            sub.textContent = match[11];
            parent.appendChild(sub);
        } else if (match[12]) {
            const kbd = document.createElement('kbd');
            kbd.textContent = match[12];
            parent.appendChild(kbd);
        }
        lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
        appendAbbreviationAwareText(parent, text.slice(lastIndex));
    }
}

function appendText(parent, value) {
    const text = String(value || '');
    appendRichText(parent, text);
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
            const buttonMatch = String(token.text || '').match(/^button:\s*(.+)$/i);
            if (buttonMatch) {
                link.className = 'terms-button-link';
                link.textContent = buttonMatch[1].trim();
            } else {
                link.textContent = token.text || href;
            }
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

    if (token.type === 'paragraph' && currentCustomBlocks.has(String(token.text || '').trim())) {
        appendCustomBlock(parent, currentCustomBlocks.get(String(token.text || '').trim()));
        return;
    }

    if (token.type === 'paragraph' && /^\[toc\]$/i.test(String(token.text || '').trim())) {
        const placeholder = document.createElement('nav');
        placeholder.className = 'terms-inline-toc';
        placeholder.setAttribute('aria-label', '本文内目次');
        parent.appendChild(placeholder);
        return;
    }

    if (token.type === 'heading') {
        const level = Math.min(Math.max(Number(token.depth) || 2, 1), 4);
        const h = document.createElement(`h${level}`);
        const parsed = parseHeadingId(token.text || '');
        if (parsed.id) {
            appendText(h, parsed.text);
            usedHeadingIds.add(parsed.id);
            h.id = parsed.id;
        } else {
            appendInlineTokens(h, token.tokens || []);
            h.id = uniqueHeadingId(h.textContent || token.text || '');
        }
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
        if (isImageOnlyParagraph(token)) {
            appendImageFigure(parent, token.tokens[0]);
            return;
        }
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

function isImageOnlyParagraph(token) {
    const tokens = token.tokens || [];
    return tokens.length === 1 && tokens[0]?.type === 'image';
}

function appendImageFigure(parent, token) {
    const href = String(token.href || '');
    if (!isSafeImageUrl(href)) {
        const p = document.createElement('p');
        p.textContent = token.text || '';
        parent.appendChild(p);
        return;
    }
    const figure = document.createElement('figure');
    figure.className = 'terms-figure';
    const image = document.createElement('img');
    image.src = href;
    image.alt = token.text || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.appendChild(image);
    if (token.title) {
        const caption = document.createElement('figcaption');
        caption.textContent = token.title;
        figure.appendChild(caption);
    }
    parent.appendChild(figure);
}

function normalizeAlertType(type) {
    const aliases = {
        補足: 'note',
        情報: 'info',
        ヒント: 'tip',
        重要: 'important',
        注意: 'warning',
        警告: 'warning',
        必須: 'important',
        禁止: 'danger',
        危険: 'danger',
    };
    const raw = String(type || 'note').trim();
    const value = (aliases[raw] || raw).toLowerCase();
    if (['note', 'info', 'tip', 'important', 'warning', 'caution', 'danger'].includes(value)) return value;
    return 'note';
}

function alertTitle(type, fallback) {
    if (fallback) return fallback;
    return {
        note: 'Note',
        info: 'Info',
        tip: 'Tip',
        important: 'Important',
        warning: 'Warning',
        caution: 'Caution',
        danger: 'Danger',
    }[type] || 'Note';
}

function appendCustomBlock(parent, block) {
    if (!block) return;
    if (block.type === 'details') {
        const details = document.createElement('details');
        details.className = block.faq ? 'terms-details terms-faq' : 'terms-details';
        const summary = document.createElement('summary');
        summary.textContent = block.title || '詳細';
        details.appendChild(summary);
        const body = document.createElement('div');
        body.className = 'terms-details-body';
        const tokens = window.marked?.lexer ? marked.lexer(block.body || '') : [];
        tokens.forEach(token => appendBlockToken(body, token));
        details.appendChild(body);
        parent.appendChild(details);
        return;
    }

    if (block.type === 'alert') {
        const type = normalizeAlertType(block.alertType);
        const aside = document.createElement('aside');
        aside.className = `terms-alert terms-alert-${type}`;
        const title = document.createElement('div');
        title.className = 'terms-alert-title';
        title.textContent = alertTitle(type, block.title);
        const body = document.createElement('div');
        body.className = 'terms-alert-body';
        const tokens = window.marked?.lexer ? marked.lexer(block.body || '') : [];
        tokens.forEach(token => appendBlockToken(body, token));
        aside.append(title, body);
        parent.appendChild(aside);
    }
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

function extractAbbreviations(markdown) {
    const abbreviations = new Map();
    const output = [];
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    for (const line of lines) {
        const match = line.match(/^\*\[([^\]\n]+)\]:\s*(.+)$/);
        if (match) {
            abbreviations.set(match[1], match[2].trim());
        } else {
            output.push(line);
        }
    }
    return { markdown: output.join('\n'), abbreviations };
}

function extractCustomBlocks(markdown) {
    const blocks = new Map();
    const output = [];
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;

    for (let i = 0; i < lines.length; i += 1) {
        const fence = lines[i].match(/^:::(details|note|info|tip|important|warning|caution|danger|補足|情報|ヒント|重要|注意|警告|必須|禁止|危険)\s*(.*)$/i);
        if (fence) {
            const body = [];
            i += 1;
            while (i < lines.length && !/^:::\s*$/.test(lines[i])) {
                body.push(lines[i]);
                i += 1;
            }
            const marker = customBlockMarker(index++);
            blocks.set(marker, {
                type: fence[1].toLowerCase() === 'details' ? 'details' : 'alert',
                alertType: fence[1],
                title: fence[2].trim(),
                body: body.join('\n').trim(),
            });
            output.push(marker);
            continue;
        }

        const faq = lines[i].match(/^\?\?\?\s*(.+)$/);
        if (faq) {
            const body = [];
            i += 1;
            let sawAnswer = false;
            while (i < lines.length && !/^\?\?\?\s*$/.test(lines[i])) {
                const answer = lines[i].match(/^!!!\s*(.*)$/);
                if (answer) {
                    sawAnswer = true;
                    if (answer[1]) body.push(answer[1]);
                } else {
                    body.push(lines[i]);
                }
                i += 1;
            }
            const marker = customBlockMarker(index++);
            blocks.set(marker, {
                type: 'details',
                faq: true,
                title: faq[1].trim(),
                body: (sawAnswer ? body : ['回答は未設定です。']).join('\n').trim(),
            });
            output.push(marker);
            continue;
        }

        const alert = lines[i].match(/^>\s*\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]\s*(.*)$/i);
        if (alert) {
            const body = [];
            i += 1;
            while (i < lines.length && /^> ?/.test(lines[i])) {
                body.push(lines[i].replace(/^> ?/, ''));
                i += 1;
            }
            i -= 1;
            const marker = customBlockMarker(index++);
            blocks.set(marker, {
                type: 'alert',
                alertType: alert[1],
                title: alert[2].trim(),
                body: body.join('\n').trim(),
            });
            output.push(marker);
            continue;
        }

        output.push(lines[i]);
    }

    return { markdown: output.join('\n'), blocks };
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
    const abbreviations = extractAbbreviations(markdown || '');
    currentAbbreviations = abbreviations.abbreviations;
    const prepared = extractFootnotes(abbreviations.markdown);
    currentFootnotes = prepared.footnotes;
    const custom = extractCustomBlocks(prepared.markdown);
    currentCustomBlocks = custom.blocks;
    if (window.marked?.setOptions) {
        marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });
    }
    const tokens = window.marked?.lexer ? marked.lexer(custom.markdown || '') : [];
    tokens.forEach(token => appendBlockToken(container, token));
    renderDefinitionLists(container);
    appendFootnotes(container);
    renderTermsToc(container);
    renderInlineTocs(container);
}

function buildTermsTocList(headings) {
    const list = document.createElement('ol');
    headings.forEach((heading) => {
        const item = document.createElement('li');
        item.className = `terms-toc-depth-${heading.tagName.slice(1)}`;
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent || '項目';
        item.appendChild(link);
        list.appendChild(item);
    });
    return list;
}

function getTocHeadings(container) {
    return Array.from(container.querySelectorAll('h1, h2, h3, h4'))
        .filter(heading => !heading.closest('.terms-footnotes'));
}

function renderTermsToc(container) {
    const toc = document.getElementById('terms-toc');
    if (!toc) return;
    toc.textContent = '';
    const headings = getTocHeadings(container);
    if (headings.length < 2) {
        toc.classList.add('u-hidden');
        return;
    }
    const title = document.createElement('div');
    title.className = 'terms-toc-title';
    title.textContent = '目次';
    const list = buildTermsTocList(headings);
    toc.append(title, list);
    toc.classList.remove('u-hidden');
}

function renderInlineTocs(container) {
    const placeholders = Array.from(container.querySelectorAll('.terms-inline-toc'));
    if (!placeholders.length) return;
    const headings = getTocHeadings(container);
    placeholders.forEach((placeholder) => {
        placeholder.textContent = '';
        if (headings.length < 2) {
            placeholder.remove();
            return;
        }
        const title = document.createElement('div');
        title.className = 'terms-toc-title';
        title.textContent = '目次';
        placeholder.append(title, buildTermsTocList(headings));
    });
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
