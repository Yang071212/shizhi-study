import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLocalLearningMemory } from './local-memory.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };

function validLocalHost(host) {
  if (typeof host !== 'string') return false;
  const match = /^(localhost|127\.0\.0\.1)(?::([0-9]{1,5}))?$/i.exec(host);
  return Boolean(match && (!match[2] || Number(match[2]) >= 1 && Number(match[2]) <= 65535));
}

function trustedRequest(req) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !validLocalHost(req.headers.host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' || origin !== parsed.origin || parsed.host.toLowerCase() !== req.headers.host.toLowerCase()) return false;
    } catch { return false; }
  }
  return true;
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

/** A loopback-only development bridge. Public builds contain no local memory. */
export function createStudyServer({ readMemory = readLocalLearningMemory, root = path.join(projectRoot, 'dist') } = {}) {
  const staticRoot = path.resolve(root);
  return http.createServer(async (req, res) => {
    if (!trustedRequest(req)) { json(res, 403, { error: '仅允许本机同源访问' }); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { json(res, 400, { error: '请求地址无效' }); return; }
    if (pathname === '/api/study-memory') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(res, 405, { error: '此接口只支持读取' }); return; }
      try { json(res, 200, { profile: await readMemory() }); }
      catch { json(res, 503, { error: '本机学习记忆暂不可用，请确认本机已保存 Codex 学习记忆', code: 'MEMORY_UNAVAILABLE' }); }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    if (pathname.includes('\\') || pathname.includes('\0')) { res.writeHead(403).end('Forbidden'); return; }
    const target = path.resolve(staticRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (target !== staticRoot && !target.startsWith(staticRoot + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    try {
      const info = await stat(target);
      const file = info.isDirectory() ? path.join(target, 'index.html') : target;
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT) || 4173;
  createStudyServer().listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
}
