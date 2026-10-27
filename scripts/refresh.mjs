import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { dailyLessons, todayKey } from '../dist/core.mjs';
import { LESSONS } from '../dist/content.mjs';

/** Refresh GitHub metadata. A failed check never advances the last success time. */
export async function refreshResources(input, fetcher = globalThis.fetch, options = {}) {
  if (!input || !Array.isArray(input.items)) throw new TypeError('资源清单缺少 items');
  const checkedAt = (options.now ?? new Date()).toISOString();
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'shizhi-study-resource-refresh', 'X-GitHub-Api-Version': '2022-11-28' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const pending = new Map();
  function metadata(repo) {
    if (!pending.has(repo)) pending.set(repo, (async () => {
      if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('仓库地址无效');
      const response = await fetcher(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 15000) });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const body = await response.json();
      if (!Number.isSafeInteger(body.stargazers_count) || body.stargazers_count < 0 || typeof body.pushed_at !== 'string' || !Number.isFinite(Date.parse(body.pushed_at))) throw new Error('GitHub 返回的数据不完整');
      return { stars: body.stargazers_count, pushedAt: body.pushed_at };
    })());
    return pending.get(repo);
  }
  const items = await Promise.all(input.items.map(async item => {
    try {
      const data = await metadata(item.repo);
      const { error, ...previous } = item;
      return { ...previous, ...data, checkedAt, lastSuccessAt: checkedAt, status: 'ok' };
    } catch (error) {
      // Keep curated descriptions, upstream timestamps, stars and lastSuccessAt.
      const message = /^GitHub HTTP \d{3}$/.test(error.message) ? error.message : error.name === 'TimeoutError' || error.name === 'AbortError' ? '连接超时，保留上次快照' : '检查未完成，保留上次快照';
      return { ...item, checkedAt, status: 'error', error: message };
    }
  }));
  const successCount = items.filter(item => item.status === 'ok').length;
  const status = successCount === items.length && items.length > 0 ? 'ok' : successCount > 0 ? 'partial' : 'error';
  return { ...input, updatedAt: checkedAt, lastSuccessAt: status === 'ok' ? checkedAt : input.lastSuccessAt ?? null, status, items };
}

async function writeJSON(filename, value) {
  await mkdir(dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filename);
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const resourcesPath = resolve(root, 'dist/resources.json');
  const input = JSON.parse(await readFile(resourcesPath, 'utf8'));
  const result = await refreshResources(input, globalThis.fetch, { token: process.env.GITHUB_TOKEN });
  await writeJSON(resourcesPath, result);
  const now = new Date();
  await writeJSON(resolve(root, 'dist/daily.json'), {
    date: todayKey(now), generatedAt: now.toISOString(), source: '课程库每日安排',
    lessonIds: dailyLessons(LESSONS, todayKey(now)).map(lesson => lesson.id),
    note: '计划每天切换；课程正文通过版本更新扩充',
  });
  const failed = result.items.filter(item => item.status !== 'ok').length;
  console.log(`资源检查 ${result.status}：${result.items.length - failed}/${result.items.length} 成功；今日计划已更新。`);
  if (failed) console.warn('部分 GitHub 检查未成功，已保留上次有效元数据；详见资源状态。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`更新失败：${error.message}`); process.exitCode = 1; });
}
