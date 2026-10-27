import test from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, shiftDay, dailyLessons, emptyState, completeLesson, gradeReview, dueReviews, streak, getState, getStorageWarning, saveState, validateImport, importBackup, saveBook, STATE_KEY, RECOVERY_KEY } from '../dist/core.mjs';

const lessons = ['c', 'python', 'calculus', 'linear'].flatMap(subject => [1, 2, 3].map(n => ({ id: `${subject}-${n}`, subject })));

test('daily date changes at Beijing midnight, independently of device timezone', () => {
  assert.equal(todayKey(new Date('2026-10-26T15:59:59Z')), '2026-10-26');
  assert.equal(todayKey(new Date('2026-10-26T16:00:00Z')), '2026-10-27');
  assert.throws(() => todayKey(new Date('invalid')));
});

test('date arithmetic rejects nonexistent dates and handles month and leap-year boundaries', () => {
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.throws(() => shiftDay('2026-02-30', 1));
});

test('daily queue starts with each subject introduction, rotates deterministically, and wraps', () => {
  assert.deepEqual(dailyLessons(lessons, '2026-10-27').map(x => x.id), ['c-1', 'python-1', 'calculus-1', 'linear-1']);
  assert.deepEqual(dailyLessons(lessons, '2026-10-28').map(x => x.id), ['c-2', 'python-2', 'calculus-2', 'linear-2']);
  assert.deepEqual(dailyLessons(lessons, '2026-10-30'), dailyLessons(lessons, '2026-10-27'));
  assert.equal(dailyLessons(lessons, '2026-10-27', 2).length, 2);
  assert.deepEqual(dailyLessons([], '2026-10-27'), []);
});

test('completion records the first completion, daily activity, and next-day review without duplicates', () => {
  const s = emptyState();
  completeLesson(s, 'c-1', '2026-10-27');
  completeLesson(s, 'c-1', '2026-10-27');
  assert.deepEqual(s.dailyDone['2026-10-27'], ['c-1']);
  assert.equal(s.reviews['c-1'].due, '2026-10-28');
  completeLesson(s, 'c-1', '2026-10-29');
  assert.equal(s.completed['c-1'], '2026-10-27');
  assert.equal(s.reviews['c-1'].due, '2026-10-28');
  assert.deepEqual(s.dailyDone['2026-10-29'], ['c-1']);
});

test('review grades expand the interval and forgotten cards reset to the next day', () => {
  const s = emptyState();
  completeLesson(s, 'c-1', '2026-10-27');
  gradeReview(s, 'c-1', 'good', '2026-10-28');
  assert.equal(s.reviews['c-1'].interval, 3);
  assert.equal(s.reviews['c-1'].due, '2026-10-31');
  gradeReview(s, 'c-1', 'easy', '2026-10-31');
  assert.equal(s.reviews['c-1'].interval, 14);
  gradeReview(s, 'c-1', 'again', '2026-11-14');
  assert.equal(s.reviews['c-1'].due, '2026-11-15');
  assert.equal(s.reviews['c-1'].streak, 0);
  assert.throws(() => gradeReview(s, 'c-1', 'wrong'));
});

test('due queue includes overdue cards, orders oldest first, and ignores removed lessons', () => {
  const s = emptyState();
  completeLesson(s, 'c-2', '2026-10-26');
  completeLesson(s, 'c-1', '2026-10-27');
  completeLesson(s, 'deleted', '2026-10-01');
  assert.deepEqual(dueReviews(s, lessons, '2026-10-28').map(x => x.id), ['c-2', 'c-1']);
  assert.equal(dueReviews(s, lessons, '2026-10-26').length, 0);
});

test('study streak deduplicates activity, counts reviews, and allows today to be unfinished', () => {
  const s = emptyState();
  completeLesson(s, 'c-1', '2026-10-25');
  s.sessions.push({ date: '2026-10-26', minutes: 25 }, { date: '2026-10-26', minutes: 5 });
  assert.equal(streak(s, '2026-10-27'), 2);
  gradeReview(s, 'c-1', 'good', '2026-10-27');
  assert.equal(streak(s, '2026-10-27'), 3);
  assert.equal(streak(s, '2026-10-29'), 0);
});

test('storage round-trip normalizes state, recovers corrupt JSON, and reports failed writes', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const s = emptyState();
  completeLesson(s, 'c-1', '2026-10-27');
  saveState(s);
  assert.deepEqual(getState(), s);
  values.set(STATE_KEY, '{broken');
  assert.deepEqual(getState(), emptyState());
  assert.equal(values.get(RECOVERY_KEY), '{broken');
  assert.match(getStorageWarning(), /原始数据已另存保护/);
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.throws(() => saveState(s), /保存失败/);
  delete globalThis.localStorage;
});

test('backup validation preserves legitimate notes and rejects executable resource URLs and hostile keys', () => {
  const s = emptyState();
  s.notes.push({ id: 'note-1', title: '<script>plain text</script>', body: '笔记正文', tags: ['C 语言'], createdAt: '2026-10-27T10:00:00Z' });
  assert.equal(validateImport(s).notes[0].title, s.notes[0].title);
  s.customResources.push({ id: 'r-1', title: 'Bad', url: 'javascript:alert(1)', category: '自定义' });
  assert.throws(() => validateImport(s), /HTTP/);
  const malicious = JSON.parse('{"completed":{"__proto__":"2026-10-27"}}');
  assert.throws(() => validateImport(malicious), /ID/);
  assert.equal({}.polluted, undefined);
});

test('malformed review, invalid quiz index, invalid dates and duplicate note IDs fail validation', () => {
  const a = emptyState();
  a.reviews['c-1'] = { due: '2026-02-30', interval: 1, streak: 0, lastGrade: 'new' };
  assert.throws(() => validateImport(a));
  const b = emptyState();
  b.quiz['c-1'] = { answer: 99, correct: false, at: '2026-10-27' };
  assert.throws(() => validateImport(b));
  const c = emptyState();
  const note = { id: 'n-1', title: 'A', body: '', tags: [], createdAt: Date.now() };
  c.notes = [note, note];
  assert.throws(() => validateImport(c), /重复/);
});

test('invalid PDF uploads are rejected before any book database write', async () => {
  await assert.rejects(saveBook(new Blob(['not a pdf'])), /不是有效的 PDF/);
  await assert.rejects(saveBook(new Blob([])), /100 MB/);
});

test('backup validates every PDF before opening a write transaction', async () => {
  const backup = { format: 'shizhi-backup', version: 1, state: emptyState(), books: [{ id: 'b-1', name: 'broken.pdf', data: btoa('not a PDF'), page: 1, totalPages: null, addedAt: '2026-10-27' }] };
  await assert.rejects(importBackup(new Blob([JSON.stringify(backup)])), /PDF/);
  await assert.rejects(importBackup(new Blob(['{}'])), /v1/);
  await assert.rejects(importBackup(new Blob(['{broken'])), /无法读取/);
  const validEmpty = { format: 'shizhi-backup', version: 1, state: emptyState(), books: [] };
  assert.deepEqual(await importBackup(new Blob([JSON.stringify(validEmpty)])), emptyState());
});

test('an incomplete backup cannot silently replace existing learning records with empty data', async () => {
  const incomplete = { format: 'shizhi-backup', version: 1, state: {}, books: [] };
  await assert.rejects(importBackup(new Blob([JSON.stringify(incomplete)])), /不完整/);
  const noBookList = { format: 'shizhi-backup', version: 1, state: emptyState() };
  await assert.rejects(importBackup(new Blob([JSON.stringify(noBookList)])), /书架备份/);
});

test('a corrupt later book cannot cause an earlier valid book to be written', async () => {
  let writes = 0;
  globalThis.indexedDB = { open: () => { writes++; throw new Error('Database must not be touched'); } };
  const good = { id: 'good', name: 'good.pdf', data: btoa('%PDF-1.7\nvalid header'), page: 1, totalPages: null, addedAt: '2026-10-27T12:00:00Z' };
  const bad = { ...good, id: 'bad', data: btoa('corrupt bytes') };
  const backup = { format: 'shizhi-backup', version: 1, state: emptyState(), books: [good, bad] };
  await assert.rejects(importBackup(new Blob([JSON.stringify(backup)])), /PDF/);
  assert.equal(writes, 0);
  delete globalThis.indexedDB;
});
