import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const p=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/ '?'/':url.pathname));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}const s=await stat(p);const f=s.isDirectory()?path.join(p,'index.html'):p;res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(f));}catch{res.writeHead(404).end('Not found');}});
server.listen(Number(process.env.PORT)||4173,'0.0.0.0',()=>console.log('Local: http://localhost:4173'));
