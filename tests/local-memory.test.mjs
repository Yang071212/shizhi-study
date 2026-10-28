import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, utimes, rm, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStudyServer } from '../scripts/serve.mjs';
import { readLocalLearningMemory, selectLearningMemory } from '../scripts/local-memory.mjs';

function request(port, headers = {}, requestPath = '/api/study-memory') {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: requestPath, headers }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });
}

test('memory endpoint rejects hostile hosts and origins before reading local memory', async t => {
  let reads = 0;
  const server = createStudyServer({ readMemory: async () => { reads++; return { source: 'codex-local', focus: [] }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  for (const headers of [{ Host: `attacker.example:${port}` }, { Origin: 'https://attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }]) {
    const response = await request(port, headers);
    assert.equal(response.status, 403);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(reads, 0);
  const safe = await request(port, { Origin: `http://127.0.0.1:${port}` });
  assert.equal(safe.status, 200);
  assert.equal(reads, 1);
  assert.deepEqual(JSON.parse(safe.body), { profile: { source: 'codex-local', focus: [] } });
});

test('only recognized study topics leave the local registry; private text and ideation are excluded', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shizhi-memory-'));
  const memoryFile = path.join(directory, 'MEMORY.md');
  t.after(async () => { await rm(memoryFile, { force: true }); await rmdir(directory); });
  const raw = '# Task Group: 高数/线代预习\n\n## Task 1: 竞赛选题\n- PRIVATE_IDEATION_951 克拉默法则\n\n## Task 2: 高数与线代预习\n- 陪域，函数，克拉默法则。 PRIVATE_NOTE_642\n\n# Task Group: 私人邮件\n## Task 1: 邮件往来\n- PRIVATE_EMAIL_780 C语言素数\n';
  await writeFile(memoryFile, raw);
  await utimes(memoryFile, new Date('2026-10-26T18:00:00Z'), new Date('2026-10-26T18:00:00Z'));
  assert.ok(!selectLearningMemory(raw).includes('PRIVATE_IDEATION_951'));
  assert.ok(!selectLearningMemory(raw).includes('PRIVATE_EMAIL_780'));
  const profile = await readLocalLearningMemory({ memoryFile, now: new Date('2026-10-27T18:00:00Z') });
  assert.equal(profile.source, 'codex-local');
  assert.ok(profile.sourceUpdatedAt);
  assert.ok(profile.focus.length > 0);
  const server = createStudyServer({ readMemory: async () => profile });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await request(server.address().port);
  assert.equal(response.status, 200);
  assert.ok(!response.body.includes('PRIVATE_'));
  assert.ok(!response.body.includes('MEMORY.md'));
  assert.ok(!response.body.includes(directory));
});

test('memory read errors do not disclose local paths or raw error messages', async t => {
  const server = createStudyServer({ readMemory: async () => { throw new Error('PRIVATE_FILE C:/private/person.txt'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await request(server.address().port);
  assert.equal(response.status, 503);
  assert.ok(!response.body.includes('PRIVATE_FILE'));
  assert.ok(!response.body.includes('person.txt'));
});
