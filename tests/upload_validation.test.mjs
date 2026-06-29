import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUploadValidation() {
  const src = readFileSync(join(__dirname, '../js/upload_validation.js'), 'utf8');
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'globalThis', src + '; return module.exports;');
  return fn(module, module.exports, globalThis);
}

function pdfBlob(content, options = {}) {
  const blob = new Blob([content], { type: options.type || 'application/pdf' });
  return Object.assign(blob, { name: options.name || 'answers.pdf' });
}

describe('upload validation', () => {
  const validation = loadUploadValidation();

  it('allows large competition PDFs by default', () => {
    expect(validation.PDF_MAX_BYTES).toBeGreaterThanOrEqual(512 * 1024 * 1024);
    expect(validation.PDF_MAX_PAGES).toBeGreaterThanOrEqual(300);
  });

  it('accepts a normal PDF signature', async () => {
    const result = await validation.validatePdfFile(pdfBlob('%PDF-1.7\nbody'));
    expect(result.ok).toBe(true);
  });

  it('rejects renamed non-PDF content', async () => {
    const result = await validation.validatePdfFile(pdfBlob('not a pdf'));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('PDFとして認識');
  });

  it('rejects oversized PDFs before parsing', async () => {
    const file = pdfBlob('%PDF-1.7\nbody');
    Object.defineProperty(file, 'size', { value: 11, configurable: true });
    const result = await validation.validatePdfFile(file, { maxBytes: 10 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('大きすぎ');
  });

  it('rejects unreadable or excessive page counts', () => {
    expect(validation.validatePdfPageCount(0).ok).toBe(false);
    expect(validation.validatePdfPageCount(301, { maxPages: 300 }).ok).toBe(false);
    expect(validation.validatePdfPageCount(300, { maxPages: 300 }).ok).toBe(true);
  });

  it('rejects detected answer numbers that do not exist in the project', () => {
    const result = validation.validateDetectedEntryNumbers([1, 2, 3], [101, 102, 103]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('参加者一覧にありません');
    expect(result.message).toContain('001');
    expect(result.message).toContain('101〜103');
  });

  it('accepts detected answer numbers that exist in the project', () => {
    const result = validation.validateDetectedEntryNumbers([101, 102, 103], [101, 102, 103, 104]);
    expect(result.ok).toBe(true);
  });
});
