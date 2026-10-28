import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseMemoryText } from '../dist/study-memory.mjs';

const learningTopic = /PTA|C\s*语言|高数|线代|预习|高等数学|线性代数/i;
const unrelatedTask = /选题|竞赛|比赛|报名|申请|策划|发布|代理|日志/i;

/** Select study groups only; never open linked rollouts or return registry text. */
export function selectLearningMemory(text) {
  const groups = String(text).split(/(?=^# Task Group:)/m);
  const selected = [];
  for (const group of groups) {
    const title = group.split(/\r?\n/, 1)[0];
    if (!title.startsWith('# Task Group:') || !learningTopic.test(title)) continue;
    const sections = group.split(/(?=^## )/m);
    const keptTasks = sections.slice(1).filter(section => {
      const heading = section.split(/\r?\n/, 1)[0];
      return /^## Task \d+:/.test(heading) && learningTopic.test(heading) && !unrelatedTask.test(heading);
    });
    // Common guidance may mix task subjects. Keep only explicitly relevant lines.
    const guidance = sections.slice(1).filter(section => !/^## Task \d+:/.test(section))
      .flatMap(section => section.split(/\r?\n/).filter(line => /^\s*[-*]\s/.test(line) && learningTopic.test(line) && !unrelatedTask.test(line)));
    const safeSections = keptTasks.map(section => section.split(/\r?\n/).filter(line => !/rollout_summaries\/|rollout_path=|thread_id=|cwd=|\.jsonl\b/.test(line)).join('\n'));
    if (safeSections.length || guidance.length) selected.push([title, ...safeSections, ...guidance].join('\n'));
  }
  return selected.join('\n\n');
}

export async function readLocalLearningMemory({ memoryFile = path.join(os.homedir(), '.codex', 'memories', 'MEMORY.md'), now = new Date() } = {}) {
  const [text, info] = await Promise.all([readFile(memoryFile, 'utf8'), stat(memoryFile)]);
  if (!info.isFile()) throw new Error('学习记忆文件不可用');
  return parseMemoryText(selectLearningMemory(text), { source: 'codex-local', sourceUpdatedAt: info.mtime.toISOString(), now });
}
