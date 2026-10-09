import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ui.js から CIQNotifications だけを取り出して、控えの動きを調べる。
const source = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const start = source.indexOf('const CIQNotifications = {');
const end = source.indexOf('window.CIQNotifications = CIQNotifications;');
const body = source.slice(start, end);

function makeCenter() {
  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  return new Function('sessionStorage', 'Date', `${body}; return CIQNotifications;`)(sessionStorage, Date);
}

describe('通知センターの控え', () => {
  it('通知を新しい順に控え、未読の数を数える', () => {
    const c = makeCenter();
    c.add('1つめ', 'success');
    c.add('2つめ', 'error');
    expect(c.state().items.map(i => i.message)).toEqual(['2つめ', '1つめ']);
    expect(c.unreadCount()).toBe(2);
  });

  it('既読にすると未読は0になり、新しい通知からまた数える', async () => {
    const c = makeCenter();
    c.add('a', 'info');
    c.markAllRead();
    expect(c.unreadCount()).toBe(0);
    await new Promise(r => setTimeout(r, 5));
    c.add('b', 'info');
    expect(c.unreadCount()).toBe(1);
  });

  it('空の通知は控えない', () => {
    const c = makeCenter();
    c.add('', 'info');
    c.add('   ', 'info');
    c.add(null, 'info');
    expect(c.state().items).toEqual([]);
  });

  it('控えは100件まで', () => {
    const c = makeCenter();
    for (let i = 0; i < 130; i += 1) c.add(`通知${i}`, 'info');
    const items = c.state().items;
    expect(items).toHaveLength(100);
    expect(items[0].message).toBe('通知129');
  });

  it('「すべて消す」で空になり、未読も0', () => {
    const c = makeCenter();
    c.add('a', 'info');
    c.clear();
    expect(c.state().items).toEqual([]);
    expect(c.unreadCount()).toBe(0);
  });

  it('変更を購読者に知らせる', () => {
    const c = makeCenter();
    let calls = 0;
    const off = c.subscribe(() => { calls += 1; });
    c.add('a', 'info');
    expect(calls).toBe(1);
    off();
    c.add('b', 'info');
    expect(calls).toBe(1);
  });

  it('運営画面でだけ、トーストを控える(ほかのページでは控えない)', () => {
    expect(source).toContain("if (window.CIQ_NOTIFICATION_CENTER === true) CIQNotifications.add(msg, type);");
    const admin = readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8');
    expect(admin).toContain('window.CIQ_NOTIFICATION_CENTER = true;');
    for (const page of ['js/judge.js', 'js/question.js', 'js/checkin.js', 'js/conflict.js', 'js/entry.js', 'js/my.js']) {
      expect(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')).not.toContain('CIQ_NOTIFICATION_CENTER');
    }
  });
});
