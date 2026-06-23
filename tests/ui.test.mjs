import { describe, it, expect } from 'vitest';

function padNum(n) { return String(n).padStart(3, '0'); }

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

describe('ui helpers', () => {
  it('padNum zero-pads to 3 digits', () => {
    expect(padNum(1)).toBe('001');
    expect(padNum(42)).toBe('042');
    expect(padNum(123)).toBe('123');
  });

  it('escapeHtml escapes dangerous characters', () => {
    expect(escapeHtml('<script>"\'&</script>')).toBe('&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;');
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
});
