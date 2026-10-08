// メールの文面と送信（機能一覧 MAIL-01〜10）を、send-email の本物の処理で作らせて確かめる。
// 送信そのもの（メール会社への通信）は差し替え、渡された件名・HTML・テキストを検査する。

import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, loadFunction } from './helpers/edge_harness.mjs';

const PROJECT = 'ciq9';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const EMAIL = 'taro@example.com';
const ENTRY = '11111111-1111-4111-8111-111111111111';
const OTHER_ENTRY = '22222222-2222-4222-8222-222222222222';
const SUPABASE_URL = 'https://abc.supabase.co';
const SIGNING = 'test-signing-secret-0123456789abcdef0123456789abcdef';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const sent = [];
const mocks = { '_shared/email_provider.ts': () => ({ emailProviderName: () => 'brevo', sendProviderEmail: async (m) => { sent.push(m); return { provider: 'brevo', providerMessageId: 'mid' }; } }) };

async function make(projOver = {}, rpc = {}) {
  sent.length = 0;
  const db = createFakeDb({ projects: [{ id: PROJECT, name: 'CIQ the 9th', entry_open: true, period_start: null, period_end: null, notify_entry_edit: true, notify_entry_cancel: true, notify_late_notice: true, ...projOver }], entries: [], email_events: [] }, { rpc });
  const call = await loadFunction('send-email', { db, env: { SUPABASE_URL }, mocks });
  const { pepperHash } = await import('../supabase/functions/_shared/participant_hash.ts');
  db.tables.entries.push({ id: ENTRY, project_id: PROJECT, entry_number: 7, email_hash_v2: await pepperHash(sha(EMAIL)) });
  db.tables.entries.push({ id: OTHER_ENTRY, project_id: PROJECT, entry_number: 8, email_hash_v2: await pepperHash(sha('other@example.com')) });
  return { db, call };
}
const send = (call, type, data = {}, over = {}) => call({
  type, to: EMAIL, projectId: PROJECT, entryId: ENTRY,
  data: { projectName: 'CIQ the 9th', entryNumber: '007', entryId: ENTRY, myUrl: 'https://chromquiz.github.io/app/my.html?pid=ciq9', ...data }, ...over,
});
const last = () => sent[sent.length - 1];
const plain = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('MAIL-02 エントリー受付完了', () => {
  const data = { password: 'Abc12345', status: 'registered', familyName: '山田', firstName: '太郎', entryListUrl: 'https://chromquiz.github.io/app/entry_list.html?pid=ciq9', qrData: ENTRY };

  it('件名・宛名・受付番号・パスワード・状態・二次元コード・ボタンが入る。プレーンテキストにも同じ情報', async () => {
    const { call } = await make();
    const r = await send(call, 'entry_confirmation', data);
    expect(r.status).toBe(200);
    expect(last().subject).toBe('【CIQ the 9th】エントリー受付完了（No.007）');
    expect(last().to).toBe(EMAIL);
    const text = plain(last().html);
    expect(text).toContain('山田 太郎 様');
    expect(text).toContain('007');
    expect(text).toContain('Abc12345');
    expect(text).toContain('登録済み');
    expect(text).toMatch(/Powered by CIQ/);
    expect(text).toMatch(/自動送信/);
    expect(last().html).toContain('href="https://chromquiz.github.io/app/my.html?pid=ciq9"');
    expect(last().html).toContain('href="https://chromquiz.github.io/app/entry_list.html?pid=ciq9"');
    expect(last().text).toContain('パスワード：Abc12345');
    expect(last().text).toContain('受付番号：007');
    expect(last().text).toMatch(/山田 太郎 様/);
  });

  it('MAIL-07 二次元コードの画像は、署名つきの URL。署名は本物の鍵で検証でき、受付番号やメールは含まない', async () => {
    const { call } = await make();
    await send(call, 'entry_confirmation', data);
    const url = last().html.match(/src="([^"]*checkin-qr[^"]*)"/)[1].replace(/&amp;/g, '&');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(`${SUPABASE_URL}/functions/v1/checkin-qr`);
    expect(u.searchParams.get('d')).toBe(ENTRY);
    expect(u.searchParams.get('s')).toBe(createHmac('sha256', SIGNING).update(ENTRY).digest('hex'));
    expect(url).not.toMatch(/Abc12345|taro@example/);
  });

  it('キャンセル待ちのときは、状態と案内が変わる', async () => {
    const { call } = await make();
    await send(call, 'entry_confirmation', { ...data, status: 'waitlist' });
    const text = plain(last().html);
    expect(text).toContain('キャンセル待ち');
    expect(text).toMatch(/繰り上がった場合は別途メールでお知らせします/);
    expect(last().text).toContain('状態：キャンセル待ち');
  });

  it('宛名が空なら、宛名の行を出さない', async () => {
    const { call } = await make();
    await send(call, 'entry_confirmation', { ...data, familyName: '', firstName: '' });
    expect(plain(last().html)).not.toMatch(/ 様 /);
    expect(last().text).not.toMatch(/様/);
  });

  it('氏名・大会名・パスワードに HTML や引用符が入っても、HTML としては動かない（エスケープされる）', async () => {
    const { call } = await make({ name: 'CIQ "<b>x</b>"' });
    await send(call, 'entry_confirmation', { ...data, projectName: 'CIQ "<b>x</b>"', familyName: '<script>alert(1)</script>', firstName: '"><img src=x onerror=alert(2)>', password: '<i>pw</i>' });
    expect(last().html).not.toMatch(/<script>alert/);
    expect(last().html).not.toMatch(/<img src=x onerror/);
    expect(last().html).not.toMatch(/<b>x<\/b>/);
    expect(last().html).not.toMatch(/<i>pw<\/i>/);
    expect(last().html).toContain('&lt;script&gt;');
  });
});

describe('MAIL-03〜06 編集・キャンセル・遅刻・繰り上げ', () => {
  it('MAIL-03 編集完了: 宛名・変更を受け付けた旨・受付番号・マイエントリーのボタン', async () => {
    const { call } = await make();
    await send(call, 'entry_edited', { familyName: '山田', firstName: '太郎' });
    expect(last().subject).toBe('【CIQ the 9th】エントリー編集完了（No.007）');
    const text = plain(last().html);
    expect(text).toContain('山田 太郎 様');
    expect(text).toContain('エントリー内容の変更を受け付けました');
    expect(last().html).toContain('href="https://chromquiz.github.io/app/my.html?pid=ciq9"');
  });

  it('MAIL-04 キャンセル完了: ボタンなし。氏名がなければ宛名の行がない', async () => {
    const { call } = await make();
    await send(call, 'entry_cancelled', {});
    expect(last().subject).toBe('【CIQ the 9th】エントリーキャンセル完了（No.007）');
    const text = plain(last().html);
    expect(text).toContain('エントリーをキャンセルしました');
    expect(text).not.toMatch(/ 様 /);
    expect(last().html).not.toContain('my.html');
    expect(last().text).not.toMatch(/様/);
  });

  it('MAIL-05 遅刻連絡: 受付した旨・マイエントリーのボタン。宛名の行はない', async () => {
    const { call } = await make();
    await send(call, 'late_notice', {});
    expect(last().subject).toBe('【CIQ the 9th】遅刻連絡受付（No.007）');
    expect(plain(last().html)).toContain('遅刻の連絡を受け付けました');
    expect(plain(last().html)).not.toMatch(/ 様 /);
    expect(last().html).toContain('my.html?pid=ciq9');
  });

  it('MAIL-06 繰り上げ: 繰り上がった旨・マイエントリーのボタン', async () => {
    const { call } = await make();
    await send(call, 'waitlist_promoted', { familyName: '山田', firstName: '太郎' });
    expect(last().subject).toBe('【CIQ the 9th】キャンセル待ち繰り上げのお知らせ（No.007）');
    expect(plain(last().html)).toContain('キャンセル待ちから通常エントリーへ繰り上がりました');
    expect(last().html).toContain('my.html?pid=ciq9');
  });

  it('大会の設定でオフにできる（編集・キャンセル・遅刻）。繰り上げは設定の対象外', async () => {
    const off = await make({ notify_entry_edit: false, notify_entry_cancel: false, notify_late_notice: false });
    for (const type of ['entry_edited', 'entry_cancelled', 'late_notice']) {
      const r = await send(off.call, type, {});
      expect(r.json, type).toEqual({ success: true, skipped: true, reason: 'notification_disabled' });
    }
    expect(sent.length).toBe(0);
    const promo = await send(off.call, 'waitlist_promoted', {});
    expect(promo.status).toBe(200);
    expect(sent.length).toBe(1);
  });
});

describe('共通の作り（件名・本文・HTML）', () => {
  it('どのメールも、件名は【大会名】で始まり、HTML とテキストの両方があり、フッターが付く', async () => {
    const { call } = await make();
    const types = [['entry_confirmation', { password: 'pw', status: 'registered', qrData: ENTRY }], ['entry_edited', {}], ['entry_cancelled', {}], ['late_notice', {}], ['waitlist_promoted', {}]];
    for (const [type, data] of types) {
      await send(call, type, data);
      const m = last();
      expect(m.subject, type).toMatch(/^【CIQ the 9th】/);
      expect(m.html.length, type).toBeGreaterThan(500);
      expect(m.text.length, type).toBeGreaterThan(20);
      expect(m.html, type).toMatch(/<table/);
      expect(m.html, type).toMatch(/prefers-color-scheme: dark/);
      expect(m.html, type).toMatch(/max-width: ?560px/);
      expect(plain(m.html), type).toMatch(/Powered by CIQ/);
    }
  });

  it('メールのスクリプト・外部の読み込み・フォームは、本文に入らない', async () => {
    const { call } = await make();
    await send(call, 'entry_confirmation', { password: 'pw', status: 'registered', qrData: ENTRY });
    expect(last().html).not.toMatch(/<script|<form|<iframe|javascript:|@import|<link /i);
    // 画像は、署名つきの二次元コードだけ
    for (const m of last().html.matchAll(/<img[^>]+src="([^"]+)"/g)) expect(m[1]).toContain('/functions/v1/checkin-qr');
  });
});

describe('MAIL-08 宛先の確認 / MAIL-09 制限 / 記録', () => {
  it('他人のエントリー ID・別のアドレス・存在しない ID では、送れない。メールは送られない', async () => {
    const { call } = await make();
    expect((await send(call, 'entry_edited', {}, { entryId: OTHER_ENTRY })).status).toBe(500);
    expect((await send(call, 'entry_edited', {}, { to: 'someone@example.com' })).status).toBe(500);
    expect((await send(call, 'entry_edited', {}, { entryId: '33333333-3333-4333-8333-333333333333' })).status).toBe(500);
    expect((await call({ type: 'entry_edited', to: EMAIL, projectId: PROJECT, data: {} })).status).toBe(400); // entryId なし
    expect(sent.length).toBe(0);
  });

  it('同じ宛先・同じ種類は、10分に10通まで。11通目は 429', async () => {
    const { call, db } = await make();
    const now = new Date().toISOString();
    const { pepperHash } = await import('../supabase/functions/_shared/participant_hash.ts');
    const logHash = await pepperHash(sha(EMAIL));
    for (let i = 0; i < 10; i += 1) db.tables.email_events.push({ id: `p${i}`, recipient_hash: logHash, template: 'entry_edited', status: 'sent', created_at: now });
    const r = await send(call, 'entry_edited', {});
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('メールの送信回数が上限に達しました。時間をおいて再度お試しください。');
    expect(sent.length).toBe(0);
    // 別の種類は数えない
    expect((await send(call, 'late_notice', {})).status).toBe(200);
  });

  it('送信は email_events に queued → sent で記録され、宛先の生のアドレスは保存されない', async () => {
    const { call, db } = await make();
    await send(call, 'entry_edited', {});
    const ev = db.tables.email_events[0];
    expect(ev).toMatchObject({ project_id: PROJECT, entry_id: ENTRY, template: 'entry_edited', provider: 'brevo', status: 'sent' });
    expect(ev.recipient_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.tables.email_events)).not.toContain(EMAIL);
  });
});
