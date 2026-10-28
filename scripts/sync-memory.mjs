import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalLearningMemory } from './local-memory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.local', 'study-memory.json');
try {
  const profile = await readLocalLearningMemory();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  console.log('本机 Codex 学习话题快照已保存至 .local/study-memory.json，可手动导入手机；未连接 ChatGPT 网页账号。');
} catch {
  console.error('无法读取本机 Codex 学习记忆，未写入快照。');
  process.exitCode = 1;
}
