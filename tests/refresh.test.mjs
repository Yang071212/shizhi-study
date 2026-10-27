import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshResources } from '../scripts/refresh.mjs';

const oldTime = '2026-10-26T00:00:00.000Z';
const now = new Date('2026-10-27T01:00:00.000Z');
const item = (id, repo) => ({ id, repo, title: id, url: `https://github.com/${repo}`, category: 'tool', license: 'MIT', stars: 42, pushedAt: oldTime, lastSuccessAt: oldTime, checkedAt: oldTime, status: 'ok' });

test('failed GitHub check retains last successful metadata and never claims it is fresh', async () => {
  const previous = { updatedAt: oldTime, lastSuccessAt: oldTime, status: 'ok', items: [item('failed', 'a/failed'), item('works', 'a/works')] };
  const snapshot = structuredClone(previous);
  const output = await refreshResources(previous, async url => url.endsWith('/failed') ? { ok: false, status: 503 } : { ok: true, json: async () => ({ stargazers_count: 100, pushed_at: '2026-10-26T20:00:00Z' }) }, { now });
  assert.equal(output.status, 'partial');
  assert.equal(output.updatedAt, now.toISOString());
  assert.equal(output.lastSuccessAt, oldTime);
  assert.equal(output.items[0].stars, 42);
  assert.equal(output.items[0].pushedAt, oldTime);
  assert.equal(output.items[0].lastSuccessAt, oldTime);
  assert.equal(output.items[0].checkedAt, now.toISOString());
  assert.equal(output.items[0].status, 'error');
  assert.equal(output.items[0].error, 'GitHub HTTP 503');
  assert.equal(output.items[1].stars, 100);
  assert.equal(output.items[1].lastSuccessAt, now.toISOString());
  assert.deepEqual(previous, snapshot);
});

test('a recovered resource clears old errors and advances success time', async () => {
  const previous = { lastSuccessAt: oldTime, status: 'error', items: [{ ...item('recovered', 'a/recovered'), status: 'error', error: 'GitHub HTTP 403' }] };
  const output = await refreshResources(previous, async () => ({ ok: true, json: async () => ({ stargazers_count: 0, pushed_at: oldTime }) }), { now });
  assert.equal(output.status, 'ok');
  assert.equal(output.lastSuccessAt, now.toISOString());
  assert.equal(output.items[0].error, undefined);
  assert.equal(output.items[0].pushedAt, oldTime);
  assert.equal(output.items[0].stars, 0);
});
