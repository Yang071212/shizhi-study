import {cp,mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const vendor='dist/vendor';await mkdir(vendor,{recursive:true});
for(const [from,to] of [['node_modules/pdfjs-dist/legacy/build/pdf.min.mjs','pdf.mjs'],['node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','pdf.worker.mjs'],['node_modules/pdfjs-dist/cmaps','cmaps'],['node_modules/pdfjs-dist/standard_fonts','standard_fonts'],['node_modules/pdfjs-dist/wasm','wasm'],['node_modules/katex/dist/katex.min.js','katex.min.js'],['node_modules/katex/dist/katex.min.css','katex.min.css'],['node_modules/katex/dist/fonts','fonts']]){if(!(await stat(from)).size&&!(await stat(from)).isDirectory())throw new Error('依赖尚未安装完整，请等待 npm ci 完成');await cp(from,path.join(vendor,to),{recursive:true});}
const pdfLicense=await readFile('node_modules/pdfjs-dist/LICENSE','utf8'),mathLicense=await readFile('node_modules/katex/LICENSE','utf8');
await writeFile('dist/THIRD_PARTY_NOTICES.txt',`拾知 · 第三方开源声明\n\nPDF.js 6.4.299 — https://github.com/mozilla/pdf.js\n${pdfLicense}\n\nKaTeX 0.19.1 — https://github.com/KaTeX/KaTeX\n${mathLicense}\n\n课程正文为原创整理。资源花园中的外部教程仅提供链接；各内容许可见原项目。\n`);
// Keep the font-specific licenses shipped by PDF.js along with their font files.
const core=['./','./index.html','./styles.css','./memory.css','./app.mjs','./core.mjs','./content.mjs','./pdf-reader.mjs','./study-memory.mjs','./memory-ui.mjs','./resources.json','./daily.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./vendor/pdf.mjs','./vendor/pdf.worker.mjs','./vendor/katex.min.js','./vendor/katex.min.css'];
for(const d of ['fonts','standard_fonts','wasm'])for(const f of await readdir(path.join(vendor,d))){if((await stat(path.join(vendor,d,f))).isFile())core.push(`./vendor/${d}/${f}`);}
const digest=createHash('sha256');for(const name of core.filter(x=>x!=='./'))digest.update(await readFile(path.join('dist',name.slice(2))));const version=digest.digest('hex').slice(0,12);
await writeFile('dist/sw.js',`/* Generated from the exact published assets. */
const CACHE='shizhi-${version}';const CORE=${JSON.stringify(core)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(CORE);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();await Promise.all((await caches.keys()).filter(k=>k.startsWith('shizhi-')&&k!==CACHE).map(k=>caches.delete(k)));})()));
self.addEventListener('fetch',event=>{const request=event.request;const url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/')||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);if(request.mode==='navigate'||/\\/(resources|daily)\\.json$/.test(url.pathname)){try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}catch{const cached=await cache.match(request);return cached||(request.mode==='navigate'?await cache.match('./index.html'):new Response('{}',{status:503}));}}const existing=await cache.match(request);if(existing)return existing;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());});
`);
console.log(`应用资源已准备：${core.length} 个离线文件，版本 ${version}`);
