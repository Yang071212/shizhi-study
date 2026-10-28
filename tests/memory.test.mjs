import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, parseMemoryText, normalizeMemory, validateMemory, importMemory } from '../dist/study-memory.mjs';
import { LESSONS } from '../dist/content.mjs';
import { emptyState, validateImport, dailyLessons, personalizedDailyLessons } from '../dist/core.mjs';

const now = new Date('2026-10-27T12:00:00.000Z');
const options = { now };
const clone = value => JSON.parse(JSON.stringify(value));

test('the trusted topic catalog covers every course lesson exactly once and matches its subject', () => {
  assert.equal(TOPICS.length, 40);
  assert.equal(new Set(TOPICS.map(topic => topic.id)).size, TOPICS.length);
  const all = TOPICS.flatMap(topic => topic.lessonIds);
  assert.equal(new Set(all).size, LESSONS.length);
  assert.deepEqual([...all].sort(), LESSONS.map(lesson => lesson.id).sort());
  for (const topic of TOPICS) for (const lessonId of topic.lessonIds) assert.equal(LESSONS.find(lesson => lesson.id === lessonId)?.subject, topic.subject);
});

test('text import stores only learning topics and constrained preferences, never source names or secrets', () => {
  const profile = parseMemoryText('姓名张某某，学号2026123456，邮箱private@example.com，密钥sk-EXAMPLE-DO-NOT-STORE。C语言初学者，先讲概念再举例自测；做过素数判断、陪域和克拉默法则。', options);
  const stored = JSON.stringify(profile);
  for (const secret of ['张某某', '2026123456', 'private@example.com', 'sk-EXAMPLE', '先讲概念再举例自测']) assert.equal(stored.includes(secret), false);
  assert.equal(profile.preferences.pace, 'beginner');
  assert.equal(profile.preferences.method, 'intuition-example-quiz');
  assert.ok(profile.focus.some(topic => topic.topicId === 'c-primes'));
  assert.ok(profile.focus.some(topic => topic.topicId === 'calculus-functions'));
  assert.ok(profile.focus.some(topic => topic.topicId === 'linear-cramer'));
  assert.ok(profile.focus.every(topic => topic.reason === '历史学习话题，掌握情况待自测'));
});

test('fingerprints depend only on extracted topics and preferences, not private text, timestamps or provenance', () => {
  const a = parseMemoryText('C语言、素数。联系人甲，账号12345。', options);
  const b = parseMemoryText('联系人乙，账号99999。素数，C语言。', { source: 'manual', now: new Date('2026-10-27T13:00:00Z') });
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.fingerprint, parseMemoryText('C语言、指针。', options).fingerprint);
});

test('unknown topic-free text and oversized Unicode text cannot create a study profile', () => {
  assert.throws(() => parseMemoryText('我的姓名和联系方式，请记下来。', options), /未识别/);
  assert.throws(() => parseMemoryText('高'.repeat(70000), options), /200 KB/);
  assert.throws(() => parseMemoryText('Python', { ...options, source: 'account-api' }), /来源无效/);
});

test('English keyword boundaries avoid accidental subject matches while supporting code-like topics', () => {
  assert.throws(() => parseMemoryText('cpythonical superstructural scrapbook', options), /未识别/);
  const p = parseMemoryText('Review Python range(10), def useful(): and shallow copy.', options);
  assert.ok(p.focus.some(topic => topic.topicId === 'python-loops'));
  assert.ok(p.focus.some(topic => topic.topicId === 'python-functions'));
  assert.ok(p.focus.some(topic => topic.topicId === 'python-lists'));
});

test('JSON with an unknown schema or invalid syntax is rejected instead of falling back to topic extraction', () => {
  assert.throws(() => importMemory('{"format":"other","content":"Python"}', options), /格式或版本/);
  assert.throws(() => importMemory('["Python"]', options), /格式或版本/);
  assert.throws(() => importMemory('"Python"', options), /格式或版本/);
  assert.throws(() => importMemory('{"Python":', options), /无法解析/);
  assert.equal(importMemory('普通文字：Python 零基础。', options).preferences.pace, 'beginner');
});

test('normalization rehydrates titles and reasons from the catalog and drops untrusted extra properties', () => {
  const raw = clone(parseMemoryText('逆矩阵', options));
  raw.focus[0].title = '<img src=x onerror=alert(1)>';
  raw.focus[0].reason = '已经掌握，考试满分';
  raw.focus[0].privateName = '不要保留';
  raw.fingerprint = 'forged';
  raw.secret = '不要保留';
  const profile = normalizeMemory(raw, options);
  assert.equal(profile.focus[0].title, '逆矩阵与可逆条件');
  assert.equal(profile.focus[0].reason, '历史学习话题，掌握情况待自测');
  assert.equal(JSON.stringify(profile).includes('不要保留'), false);
  assert.notEqual(profile.fingerprint, 'forged');
  assert.deepEqual(validateMemory(profile, options), profile);
});

test('unknown IDs, cross-subject lesson claims and malformed preferences cannot enter state', () => {
  const raw = parseMemoryText('素数', options);
  const badTopic = clone(raw); badTopic.focus[0].topicId = '__proto__';
  assert.throws(() => normalizeMemory(badTopic, options), /话题/);
  const badSubject = clone(raw); badSubject.focus[0].subject = 'python';
  assert.throws(() => normalizeMemory(badSubject, options), /不匹配/);
  const badLesson = clone(raw); badLesson.focus[0].lessonIds = ['python-01'];
  assert.throws(() => normalizeMemory(badLesson, options), /不匹配/);
  const badPreference = clone(raw); badPreference.preferences.pace = 'expert';
  assert.throws(() => normalizeMemory(badPreference, options), /偏好/);
  const duplicate = clone(raw); duplicate.focus.push(clone(duplicate.focus[0]));
  assert.throws(() => normalizeMemory(duplicate, options), /重复/);
});

test('timestamps cannot claim future source updates or impossible calendar dates', () => {
  assert.throws(() => parseMemoryText('Python', { ...options, sourceUpdatedAt: '2026-10-28T00:00:00.000Z' }), /未来/);
  const raw = parseMemoryText('Python', options);
  const future = clone(raw); future.updatedAt = '2030-01-01T00:00:00.000Z';
  assert.throws(() => normalizeMemory(future, options), /未来/);
  const impossible = clone(raw); impossible.updatedAt = '2026-02-30T00:00:00.000Z';
  assert.throws(() => normalizeMemory(impossible, options), /不存在/);
  const afterExtraction = clone(raw); afterExtraction.updatedAt = '2026-10-26T00:00:00.000Z'; afterExtraction.sourceUpdatedAt = '2026-10-27T00:00:00.000Z';
  assert.throws(() => normalizeMemory(afterExtraction, options), /晚于整理/);
});

test('imported history never marks lessons completed or creates reviews, even when prose claims mastery', () => {
  const state = emptyState();
  state.memory = parseMemoryText('我已完全掌握素数和逆矩阵，考试满分。', options);
  const before = clone(state);
  const normalized = validateImport(state);
  assert.deepEqual(normalized.completed, {});
  assert.deepEqual(normalized.reviews, {});
  assert.deepEqual(normalized.quiz, {});
  personalizedDailyLessons(LESSONS, normalized, '2026-10-27');
  assert.deepEqual(state, before);
});

test('old state and v1 full backups without memory or auto-sync settings still restore normally', () => {
  const legacy = emptyState();
  delete legacy.memory;
  delete legacy.settings.memoryAutoSync;
  legacy.completed['c-01'] = '2026-10-26';
  const restored = validateImport({ format: 'shizhi-backup', version: 1, state: legacy, books: [] });
  assert.equal(restored.memory, null);
  assert.equal(restored.settings.memoryAutoSync, true);
  assert.deepEqual(restored.completed, { 'c-01': '2026-10-26' });
});

test('memory and explicit auto-sync pause survive state validation and backup normalization', () => {
  const state = emptyState();
  state.memory = parseMemoryText('Python入门和陪域', options);
  state.settings.memoryAutoSync = false;
  const restored = validateImport({ format: 'shizhi-backup', version: 1, state, books: [] });
  assert.deepEqual(restored.memory, state.memory);
  assert.equal(restored.settings.memoryAutoSync, false);
  state.settings.memoryAutoSync = 'false';
  assert.throws(() => validateImport(state), /同步设置/);
});

test('no profile or no usable focused candidates preserves the original daily queue exactly', () => {
  const state = emptyState();
  assert.deepEqual(personalizedDailyLessons(LESSONS, state, '2026-10-28'), dailyLessons(LESSONS, '2026-10-28'));
  state.memory = parseMemoryText('素数', options);
  state.completed['c-05'] = '2026-10-26';
  assert.deepEqual(personalizedDailyLessons(LESSONS, state, '2026-10-28'), dailyLessons(LESSONS, '2026-10-28'));
});

test('personalized suggestions remain deterministic, one per subject, and prioritize unanswered focus mistakes', () => {
  const state = emptyState();
  state.memory = parseMemoryText('素数与指针，Python列表切片，陪域，克拉默法则', options);
  state.quiz['c-09'] = { answer: 0, correct: false, at: now.toISOString() };
  const a = personalizedDailyLessons(LESSONS, state, '2026-10-28');
  const b = personalizedDailyLessons(LESSONS, state, '2026-10-28');
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(x => x.subject), ['c', 'python', 'calculus', 'linear']);
  assert.equal(a[0].id, 'c-09');
  assert.equal(a[2].id, 'calculus-01');
  assert.equal(a[3].id, 'linear-09');
  assert.equal(new Set(a.map(x => x.id)).size, 4);
  assert.equal(personalizedDailyLessons(LESSONS, state, '2026-10-28', 2).length, 2);
});

test('a completed focused lesson returns to daily suggestions when its latest self-test was wrong', () => {
  const state = emptyState();
  state.memory = parseMemoryText('素数与指针', options);
  state.completed['c-05'] = '2026-10-26';
  state.quiz['c-05'] = { answer: 0, correct: false, at: now.toISOString() };
  assert.equal(personalizedDailyLessons(LESSONS, state, '2026-10-28')[0].id, 'c-05');
  state.quiz['c-05'].correct = true;
  assert.equal(personalizedDailyLessons(LESSONS, state, '2026-10-28')[0].id, 'c-09');
});
