/* Device-local learning state and PDF storage. No account or network access. */
import { normalizeMemory } from './study-memory.mjs';
export const STATE_KEY = 'shizhi-state-v1';
export const RECOVERY_KEY = 'shizhi-state-v1-recovery';
export const BACKUP_FORMAT = 'shizhi-backup';
const MAX_BOOK = 100 * 1024 * 1024;
const MAX_BACKUP = 200 * 1024 * 1024;
const DAY = 86400000;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw new Error(message); };
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
let storageWarning = '', unsavedRecovery = null;

export function todayKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) fail('日期无效');
  const p = Object.fromEntries(dateFormatter.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function dayValue(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) fail('日期格式应为 YYYY-MM-DD');
  const d = new Date(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== key) fail('日期不存在');
  return d.getTime();
}

export function shiftDay(key, n) {
  if (!Number.isInteger(n) || Math.abs(n) > 36500) fail('日期偏移无效');
  return new Date(dayValue(key) + n * DAY).toISOString().slice(0, 10);
}

export function dailyLessons(lessons, dateKey = todayKey(), limit = 4) {
  if (!Array.isArray(lessons)) return [];
  const offset = Math.floor((dayValue(dateKey) - dayValue('2026-10-27')) / DAY);
  const groups = new Map();
  for (const lesson of lessons) {
    if (!lesson || typeof lesson.subject !== 'string') continue;
    if (!groups.has(lesson.subject)) groups.set(lesson.subject, []);
    groups.get(lesson.subject).push(lesson);
  }
  const ordered = ['c', 'python', 'calculus', 'linear', ...groups.keys()].filter((x, i, a) => a.indexOf(x) === i && groups.has(x));
  return ordered.slice(0, Math.max(0, Math.min(100, Math.trunc(limit)))).map(subject => {
    const items = groups.get(subject);
    return items[((offset % items.length) + items.length) % items.length];
  });
}

/** Personalization only changes suggestions; imported history never grants mastery. */
export function personalizedDailyLessons(lessons, state, dateKey = todayKey(), limit = 4) {
  const baseline = dailyLessons(lessons, dateKey, limit);
  if (!state?.memory) return baseline;
  let memory;
  try { memory = normalizeMemory(state.memory); } catch { return baseline; }
  const focused = new Set(memory.focus.flatMap(topic => topic.lessonIds));
  const offset = Math.floor((dayValue(dateKey) - dayValue('2026-10-27')) / DAY);
  return baseline.map(fallback => {
    const candidates = lessons.filter(lesson => lesson.subject === fallback.subject && focused.has(lesson.id) && (!state.completed?.[lesson.id] || state.quiz?.[lesson.id]?.correct === false));
    const mistakes = candidates.filter(lesson => state.quiz?.[lesson.id]?.correct === false);
    const pool = mistakes.length ? mistakes : candidates;
    return pool.length ? pool[((offset % pool.length) + pool.length) % pool.length] : fallback;
  });
}

export function emptyState() {
  return { completed: {}, reviews: {}, quiz: {}, notes: [], customResources: [], sessions: [], settings: { goal: 30, theme: 'light', memoryAutoSync: true }, dailyDone: {}, memory: null };
}

function text(v, max, label, allowEmpty = true) {
  if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim())) fail(`${label}格式无效`);
  return v;
}
function id(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(v) || ['__proto__', 'constructor', 'prototype'].includes(v)) fail('内容 ID 无效');
  return v;
}
function integer(v, min, max, label) {
  if (!Number.isInteger(v) || v < min || v > max) fail(`${label}无效`);
  return v;
}
function date(v) { dayValue(v); return v; }
function timestamp(v, label = '时间') {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e15) return v;
  if (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))) return v;
  fail(`${label}无效`);
}
function list(v, max, label) {
  if (!Array.isArray(v) || v.length > max) fail(`${label}格式无效`);
  return v;
}
function mapObject(v, max, label, normalize) {
  if (!record(v) || Object.keys(v).length > max) fail(`${label}格式无效`);
  const result = {};
  for (const [key, value] of Object.entries(v)) result[id(key)] = normalize(value);
  return result;
}
function safeURL(value) {
  text(value, 2048, '链接', false);
  let u;
  try { u = new URL(value); } catch { fail('链接必须是完整网址'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) fail('链接只支持不含密码的 HTTP/HTTPS 网址');
  return u.href;
}

/** Accept a state or an exported backup; return a fully validated state. */
export function validateImport(data) {
  if (!record(data)) fail('备份内容格式无效');
  if (own(data, 'format')) {
    if (data.format !== BACKUP_FORMAT || data.version !== 1 || !record(data.state)) fail('不支持此备份格式或版本');
    const required = ['completed', 'reviews', 'quiz', 'notes', 'customResources', 'sessions', 'settings', 'dailyDone'];
    if (required.some(key => !own(data.state, key))) fail('备份中的学习记录不完整，请重新选择原始备份');
    data = data.state;
  }
  const s = emptyState();
  s.completed = mapObject(data.completed ?? {}, 20000, '完成记录', date);
  s.reviews = mapObject(data.reviews ?? {}, 20000, '复习记录', v => {
    if (!record(v)) fail('复习记录格式无效');
    if (!['new', 'again', 'good', 'easy'].includes(v.lastGrade)) fail('复习评价无效');
    return { due: date(v.due), interval: integer(v.interval, 1, 3650, '复习间隔'), streak: integer(v.streak, 0, 10000, '复习次数'), lastGrade: v.lastGrade };
  });
  s.quiz = mapObject(data.quiz ?? {}, 20000, '练习记录', v => {
    if (!record(v) || typeof v.correct !== 'boolean') fail('练习记录格式无效');
    return { answer: integer(v.answer, 0, 19, '答案'), correct: v.correct, at: timestamp(v.at) };
  });
  s.notes = list(data.notes ?? [], 10000, '笔记').map(v => {
    if (!record(v)) fail('笔记格式无效');
    return { id: id(v.id), title: text(v.title, 300, '笔记标题', false), body: text(v.body, 100000, '笔记正文'), tags: list(v.tags ?? [], 30, '笔记标签').map(x => text(x, 60, '标签')), createdAt: timestamp(v.createdAt) };
  });
  s.customResources = list(data.customResources ?? [], 5000, '自定义资源').map(v => {
    if (!record(v)) fail('资源格式无效');
    return { id: id(v.id), title: text(v.title, 300, '资源标题', false), url: safeURL(v.url), category: text(v.category ?? '自定义', 100, '资源分类') };
  });
  s.sessions = list(data.sessions ?? [], 100000, '专注记录').map(v => {
    if (!record(v) || typeof v.minutes !== 'number' || !Number.isFinite(v.minutes) || v.minutes <= 0 || v.minutes > 1440) fail('专注记录格式无效');
    return { date: date(v.date), minutes: v.minutes };
  });
  if (data.settings !== undefined && !record(data.settings)) fail('设置格式无效');
  const settings = data.settings ?? {};
  if (settings.memoryAutoSync !== undefined && typeof settings.memoryAutoSync !== 'boolean') fail('记忆自动同步设置无效');
  s.settings = { goal: integer(settings.goal ?? 30, 5, 240, '每日目标'), theme: ['light', 'dark', 'system'].includes(settings.theme) ? settings.theme : 'light', memoryAutoSync: settings.memoryAutoSync ?? true };
  if (data.dailyDone !== undefined && !record(data.dailyDone)) fail('每日记录格式无效');
  if (Object.keys(data.dailyDone ?? {}).length > 36500) fail('每日记录过多');
  for (const [key, value] of Object.entries(data.dailyDone ?? {})) s.dailyDone[date(key)] = [...new Set(list(value, 1000, '每日完成记录').map(id))];
  if (new Set(s.notes.map(v => v.id)).size !== s.notes.length || new Set(s.customResources.map(v => v.id)).size !== s.customResources.length) fail('内容存在重复 ID');
  s.memory = data.memory == null ? null : normalizeMemory(data.memory);
  return s;
}

export function getState() {
  let raw;
  try {
    raw = localStorage.getItem(STATE_KEY);
  } catch {
    storageWarning = '浏览器未开放学习记录存储。请允许本地存储，并及时导出备份。';
    return emptyState();
  }
  if (!raw) return emptyState();
  try { return validateImport(JSON.parse(raw)); }
  catch {
    // Preserve the original bytes before allowing a new state to replace them.
    unsavedRecovery = raw;
    try {
      localStorage.setItem(RECOVERY_KEY, raw);
      unsavedRecovery = null;
      storageWarning = '本机学习记录格式异常，原始数据已另存保护。请从完整备份恢复学习记录。';
    } catch {
      storageWarning = '本机学习记录无法读取，原始数据仍保留。请先释放存储空间或从完整备份恢复。';
    }
    return emptyState();
  }
}

export function getStorageWarning() { return storageWarning; }

export function saveState(state) {
  const clean = validateImport(state);
  try {
    if (unsavedRecovery !== null) { localStorage.setItem(RECOVERY_KEY, unsavedRecovery); unsavedRecovery = null; }
    localStorage.setItem(STATE_KEY, JSON.stringify(clean));
  }
  catch { fail('学习记录保存失败，请检查浏览器存储空间，并及时导出备份'); }
  return clean;
}

export function completeLesson(state, lessonId, dateKey = todayKey()) {
  id(lessonId); date(dateKey);
  state.completed[lessonId] ??= dateKey;
  state.dailyDone[dateKey] ??= [];
  if (!state.dailyDone[dateKey].includes(lessonId)) state.dailyDone[dateKey].push(lessonId);
  state.reviews[lessonId] ??= { due: shiftDay(dateKey, 1), interval: 1, streak: 0, lastGrade: 'new' };
  return state;
}

export function gradeReview(state, lessonId, grade, dateKey = todayKey()) {
  id(lessonId); date(dateKey);
  if (!['again', 'good', 'easy'].includes(grade)) fail('请选择有效的复习评价');
  const previous = state.reviews[lessonId] ?? { streak: 0 };
  const count = grade === 'again' ? 0 : previous.streak + (grade === 'easy' ? 2 : 1);
  const intervals = [1, 3, 7, 14, 30, 60, 90];
  const interval = intervals[Math.min(count, intervals.length - 1)];
  state.reviews[lessonId] = { due: shiftDay(dateKey, interval), interval, streak: count, lastGrade: grade };
  state.dailyDone[dateKey] ??= [];
  if (!state.dailyDone[dateKey].includes(lessonId)) state.dailyDone[dateKey].push(lessonId);
  return state;
}

export function dueReviews(state, lessons, dateKey = todayKey()) {
  date(dateKey);
  const lookup = new Map(lessons.map(x => [x.id, x]));
  return Object.entries(state.reviews).filter(([lessonId, r]) => lookup.has(lessonId) && r.due <= dateKey)
    .sort((a, b) => a[1].due.localeCompare(b[1].due)).map(([lessonId]) => lookup.get(lessonId));
}

export function streak(state, dateKey = todayKey()) {
  date(dateKey);
  const active = new Set([...Object.values(state.completed), ...state.sessions.map(x => x.date), ...Object.entries(state.dailyDone).filter(([, x]) => x.length).map(([d]) => d)]);
  let cursor = active.has(dateKey) ? dateKey : shiftDay(dateKey, -1);
  let count = 0;
  while (active.has(cursor) && count < 36500) { count++; cursor = shiftDay(cursor, -1); }
  return count;
}

let dbPromise;
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('此浏览器不支持本地书架，请使用新版 Safari 或 Chrome'));
    const request = indexedDB.open('shizhi-books-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('books')) request.result.createObjectStore('books', { keyPath: 'id' });
    };
    request.onerror = () => reject(new Error('书架无法打开，请检查浏览器是否允许本地存储'));
    request.onblocked = () => reject(new Error('书架正在升级，请关闭其他拾知页面后重试'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = undefined; };
      resolve(db);
    };
  }).catch(error => { dbPromise = undefined; throw error; });
  return dbPromise;
}

async function bookTransaction(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('books', mode);
    let request;
    try { request = action(transaction.objectStore('books')); }
    catch (error) { transaction.abort(); reject(error); return; }
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(new Error(transaction.error?.name === 'QuotaExceededError' ? '书架空间不足，请导出备份后移除部分 PDF' : '书架保存失败，请重试'));
    transaction.onabort = () => reject(new Error('书架操作未完成，原有资料仍被保留'));
  });
}

export async function saveBook(file) {
  if (!(file instanceof Blob) || file.size < 5 || file.size > MAX_BOOK) fail('请选择不超过 100 MB 的 PDF 文件');
  if (await file.slice(0, 5).text() !== '%PDF-') fail('这个文件不是有效的 PDF，请重新选择');
  const book = { id: crypto.randomUUID(), name: String(file.name ?? '未命名电子书.pdf').slice(0, 500), size: file.size, page: 1, totalPages: null, addedAt: new Date().toISOString(), blob: file };
  await bookTransaction('readwrite', store => store.put(book));
  return book;
}

export async function listBooks() {
  const books = await bookTransaction('readonly', store => store.getAll());
  return books.sort((a, b) => new Date(b.lastRead ?? b.addedAt).getTime() - new Date(a.lastRead ?? a.addedAt).getTime());
}
export async function getBook(bookId) { id(bookId); return bookTransaction('readonly', store => store.get(bookId)); }
export async function deleteBook(bookId) { id(bookId); return bookTransaction('readwrite', store => store.delete(bookId)); }
export async function updateBook(bookId, patch) {
  const book = await getBook(bookId);
  if (!book) fail('这本书已被移除');
  if (!record(patch)) fail('阅读进度无效');
  if (own(patch, 'totalPages')) book.totalPages = integer(patch.totalPages, 1, 100000, '总页数');
  if (own(patch, 'page')) book.page = integer(patch.page, 1, book.totalPages ?? 100000, '阅读页码');
  if (own(patch, 'name')) book.name = text(patch.name, 500, '书名', false);
  book.lastRead = new Date().toISOString();
  await bookTransaction('readwrite', store => store.put(book));
  return book;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function base64ToBlob(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_BOOK / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('备份中的 PDF 数据格式无效');
  let binary;
  try { binary = atob(value); } catch { fail('备份中的 PDF 数据已损坏'); }
  if (!binary.startsWith('%PDF-') || binary.length > MAX_BOOK) fail('备份中包含无效的 PDF 文件');
  const chunks = [];
  for (let i = 0; i < binary.length; i += 65536) chunks.push(Uint8Array.from(binary.slice(i, i + 65536), c => c.charCodeAt(0)));
  return new Blob(chunks, { type: 'application/pdf' });
}

export async function exportBackup(state) {
  const clean = validateImport(state);
  const books = await listBooks();
  if (books.reduce((n, b) => n + b.size, 0) > MAX_BACKUP) fail('书架超过 200 MB，请分批移除或另行备份原始 PDF 后再导出');
  const files = [];
  for (const { blob, ...meta } of books) files.push({ ...meta, data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) });
  return new Blob([JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), state: clean, books: files })], { type: 'application/json' });
}

export async function importBackup(file) {
  if (!(file instanceof Blob) || file.size > 300 * 1024 * 1024) fail('备份文件过大，请选择不超过 300 MB 的备份');
  let data;
  try { data = JSON.parse(await file.text()); } catch { fail('无法读取备份，请选择拾知导出的 JSON 文件'); }
  if (!record(data) || data.format !== BACKUP_FORMAT || data.version !== 1) fail('请选择拾知导出的 v1 备份');
  const state = validateImport(data);
  const source = list(data.books, 5000, '书架备份');
  const books = [];
  let total = 0;
  for (const b of source) {
    if (!record(b)) fail('书架备份格式无效');
    const blob = base64ToBlob(b.data);
    total += blob.size;
    if (total > MAX_BACKUP) fail('备份中的 PDF 总量超过 200 MB');
    const totalPages = b.totalPages == null ? null : integer(b.totalPages, 1, 100000, 'PDF 总页数');
    const book = { id: id(b.id), name: text(b.name, 500, '书名', false), size: blob.size, page: integer(b.page, 1, totalPages ?? 100000, '阅读页码'), totalPages, addedAt: timestamp(b.addedAt), blob };
    if (b.lastRead !== undefined) book.lastRead = timestamp(b.lastRead);
    books.push(book);
  }
  if (new Set(books.map(b => b.id)).size !== books.length) fail('备份中存在重复电子书 ID');
  // Validate every file before beginning a single atomic IndexedDB transaction.
  if (books.length) await bookTransaction('readwrite', store => { let last; for (const b of books) last = store.put(b); return last; });
  return state;
}
