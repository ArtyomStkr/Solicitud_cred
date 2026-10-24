import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Solicitud_cred/' : './',
  plugins: [react(), {
    name: 'josu-offline',
    closeBundle() {
      const files = fs.readdirSync('dist', { recursive: true }).map(String).filter(f => fs.statSync(path.join('dist', f)).isFile()).map(f => f.replaceAll('\\', '/')).filter(f => f !== 'sw.js');
      const version = crypto.createHash('sha256').update(files.map(f => fs.readFileSync(path.join('dist', f))).join('')).digest('hex').slice(0, 12);
      fs.writeFileSync('dist/sw.js', `const CACHE='josu-${version}';const FILES=${JSON.stringify(files)};const URLS=FILES.map(f=>new URL(f,self.registration.scope).href);self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('josu-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(new URL('index.html',self.registration.scope).href)));return}if(URLS.includes(e.request.url))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});`);
    },
  }],
});
