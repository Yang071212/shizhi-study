import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, parseMemoryText } from '../dist/study-memory.mjs';
import { encodeMobileMemory, decodeMobileMemory, makeMobileSyncURL, readMobileMemoryHash } from '../dist/mobile-sync.mjs';

const now = new Date('2026-10-28T00:00:00.000Z');
const options = { now };
const profile = () => parseMemoryText('C语言初学者，先讲概念，再练素数、陪域与克拉默法则。', { ...options, source: 'codex-local', sourceUpdatedAt: '2026-10-27T12:00:00.000Z' });
const encodeJSON = data => Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
const compact = () => ({ v: 1, s: 'manual', t: now.toISOString(), o: null, p: ['balanced', 'example-practice'], f: ['c-primes'] });

test('mobile snapshot round-trips trusted study content without retaining private source text or extra fields', () => {
  const original = profile();
  original.secret = 'sk-DO-NOT-SHARE';
  original.focus[0].title = 'Private Person private@example.com';
  const before = JSON.stringify(original);
  const encoded = encodeMobileMemory(original);
  const decoded = decodeMobileMemory(encoded, options);
  assert.equal(JSON.stringify(original), before);
  assert.equal(decoded.fingerprint, original.fingerprint);
  assert.deepEqual(decoded.preferences, original.preferences);
  assert.deepEqual(decoded.focus.map(topic => topic.topicId), original.focus.map(topic => topic.topicId));
  const raw = Buffer.from(encoded, 'base64url').toString('utf8');
  assert.equal(raw.includes('sk-DO-NOT-SHARE'), false);
  assert.equal(raw.includes('Private Person'), false);
  assert.equal(raw.includes('private@example.com'), false);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['f', 'o', 'p', 's', 't', 'v']);
});

test('sync URL uses the selected application directory and fragment only, removing prior query data', () => {
  const url = new URL(makeMobileSyncURL(profile(), 'https://example.com/shizhi-study/#memory'));
  assert.equal(url.pathname, '/shizhi-study/phone.html');
  assert.equal(url.search, '');
  assert.ok(url.hash.startsWith('#sync='));
  assert.deepEqual(readMobileMemoryHash(url.hash, options), decodeMobileMemory(url.hash.slice(6), options));
  assert.equal(new URL(makeMobileSyncURL(profile(), 'https://example.com/shizhi-study?secret=REMOVE#memory')).pathname, '/shizhi-study/phone.html');
  const fromFile = new URL(makeMobileSyncURL(profile(), 'https://example.com/shizhi-study/index.html?private=REMOVE'));
  assert.equal(fromFile.pathname, '/shizhi-study/phone.html');
  assert.equal(fromFile.href.includes('REMOVE'), false);
});

test('URL targets reject insecure remote schemes and credentials while accepting loopback debugging', () => {
  for (const target of ['http://example.com/app/', 'javascript:alert(1)', 'file:///app/', 'https://user:password@example.com/app/']) assert.throws(() => makeMobileSyncURL(profile(), target));
  for (const target of ['http://localhost:5173/app/', 'http://127.0.0.1:5173/app/', 'http://[::1]:5173/app/']) assert.ok(makeMobileSyncURL(profile(), target).includes('/app/phone.html#sync='));
});

test('malformed, oversized, padded and noncanonical base64url strings are rejected', () => {
  for (const encoded of ['', 'a', 'abc=', 'ab+c', 'ab/c', 'x'.repeat(8193), 'Zh']) assert.throws(() => decodeMobileMemory(encoded, options));
  assert.throws(() => decodeMobileMemory(Buffer.from([0xff, 0xfe]).toString('base64url'), options), /损坏/);
  assert.throws(() => decodeMobileMemory(Buffer.from('x'.repeat(4097)).toString('base64url'), options), /过大/);
});

test('payload rejects unknown schemas, extra private fields, prototype keys, unknown or duplicate topics', () => {
  for (const bad of [null, [], { ...compact(), v: 2 }, { ...compact(), privateName: 'secret' }, JSON.parse('{"v":1,"s":"manual","t":"2026-10-28T00:00:00.000Z","o":null,"p":["balanced","example-practice"],"f":["c-primes"],"__proto__":{"polluted":true}}'), { ...compact(), f: ['unknown'] }, { ...compact(), f: ['c-primes', 'c-primes'] }, { ...compact(), f: ['constructor'] }]) assert.throws(() => decodeMobileMemory(encodeJSON(bad), options));
  assert.equal({}.polluted, undefined);
});

test('source, study preference and timestamp claims are validated before a snapshot is returned', () => {
  for (const bad of [{ ...compact(), s: 'chatgpt-account-api' }, { ...compact(), p: ['expert', 'example-practice'] }, { ...compact(), t: '2030-01-01T00:00:00.000Z' }, { ...compact(), o: '2026-10-29T00:00:00.000Z' }, { ...compact(), o: {} }]) assert.throws(() => decodeMobileMemory(encodeJSON(bad), options));
});

test('hash reader ignores other app routes and rejects duplicate or smuggled sync parameters', () => {
  assert.equal(readMobileMemoryHash(''), null);
  assert.equal(readMobileMemoryHash('#memory'), null);
  const encoded = encodeMobileMemory(profile());
  assert.throws(() => readMobileMemoryHash(`#sync=${encoded}&sync=${encoded}`, options), /参数无效/);
  assert.throws(() => readMobileMemoryHash(`#sync=${encoded}&state=replace`, options), /参数无效/);
  assert.throws(() => readMobileMemoryHash('#sync=', options));
  assert.deepEqual(readMobileMemoryHash(`#sync=${encoded}`, options), decodeMobileMemory(encoded, options));
});

test('the complete known topic catalog still fits compact mobile transfer limits', () => {
  const all = profile();
  all.focus = TOPICS.map(topic => ({ topicId: topic.id, subject: topic.subject, title: topic.title, lessonIds: [...topic.lessonIds], reason: '' }));
  const encoded = encodeMobileMemory(all);
  assert.ok(encoded.length < 8192);
  assert.equal(decodeMobileMemory(encoded, options).focus.length, 40);
});
