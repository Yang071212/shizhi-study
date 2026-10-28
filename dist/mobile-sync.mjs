/* A user-shared, study-only snapshot in the URL fragment; no network or storage. */
import { TOPICS, normalizeMemory } from './study-memory.mjs';

const MAX_ENCODED = 8192;
const MAX_DECODED = 4096;
const topicById = new Map(TOPICS.map(topic => [topic.id, topic]));
const fail = message => { throw new Error(message); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function base64URL(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function encodeMobileMemory(profile) {
  const memory = normalizeMemory(profile);
  const payload = {
    v: 1,
    s: memory.source,
    t: memory.updatedAt,
    o: memory.sourceUpdatedAt,
    p: [memory.preferences.pace, memory.preferences.method],
    f: memory.focus.map(topic => topic.topicId),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_DECODED) fail('学习记忆过大，无法生成手机同步链接');
  const encoded = base64URL(bytes);
  if (encoded.length > MAX_ENCODED) fail('学习记忆过大，无法生成手机同步链接');
  return encoded;
}

export function decodeMobileMemory(encoded, { now = new Date() } = {}) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) fail('手机同步链接格式无效');
  let bytes, payload;
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(padded);
    if (binary.length > MAX_DECODED) fail('手机同步内容过大');
    bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (base64URL(bytes) !== encoded) fail('手机同步编码无效');
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (/^手机同步/.test(error?.message ?? '')) throw error;
    fail('手机同步内容已损坏，请重新生成链接');
  }
  const keys = ['v', 's', 't', 'o', 'p', 'f'];
  if (!record(payload) || Object.keys(payload).length !== keys.length || Object.keys(payload).some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(payload, key)) || payload.v !== 1) fail('不支持此手机同步格式或版本');
  if (!Array.isArray(payload.p) || payload.p.length !== 2 || !Array.isArray(payload.f) || !payload.f.length || payload.f.length > TOPICS.length || new Set(payload.f).size !== payload.f.length) fail('手机同步学习内容无效');
  if (payload.o !== null && typeof payload.o !== 'string') fail('手机同步来源时间无效');
  const focus = payload.f.map(id => {
    if (typeof id !== 'string' || !topicById.has(id)) fail('手机同步包含未知学习话题');
    const topic = topicById.get(id);
    return { topicId: topic.id, subject: topic.subject, title: topic.title, lessonIds: [...topic.lessonIds], reason: '历史学习话题，掌握情况待自测' };
  });
  return normalizeMemory({
    format: 'shizhi-study-memory', version: 1, source: payload.s,
    updatedAt: payload.t, sourceUpdatedAt: payload.o,
    preferences: { pace: payload.p[0], method: payload.p[1] }, focus,
  }, { now });
}

export function makeMobileSyncURL(profile, baseURL) {
  let base;
  try { base = new URL(baseURL); } catch { fail('应用地址无效，请使用完整网址'); }
  const loopback = base.hostname === 'localhost' || base.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(base.hostname);
  if (base.username || base.password || !(base.protocol === 'https:' || base.protocol === 'http:' && loopback)) fail('手机同步地址必须使用 HTTPS，或本机调试地址');
  base.hash = '';
  base.search = '';
  if (!base.pathname.endsWith('/')) {
    if (/\/[^/]+\.html?$/i.test(base.pathname)) base.pathname = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
    else base.pathname += '/';
  }
  const target = new URL('phone.html', base);
  target.hash = `sync=${encodeMobileMemory(profile)}`;
  return target.href;
}

export function readMobileMemoryHash(hash, options = {}) {
  if (hash === '') return null;
  if (typeof hash !== 'string' || !hash.startsWith('#') || hash.length > MAX_ENCODED + 100) fail('手机同步链接格式无效');
  const params = new URLSearchParams(hash.slice(1));
  if (!params.has('sync')) return null;
  if (params.getAll('sync').length !== 1 || [...params.keys()].some(key => key !== 'sync')) fail('手机同步链接参数无效');
  return decodeMobileMemory(params.get('sync'), options);
}
