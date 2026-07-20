const CACHE='moneybrain-v1';const ASSETS=['./','index.html','styles.css','app.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))) });
