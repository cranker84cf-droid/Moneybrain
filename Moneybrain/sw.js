const CACHE='moneybrain-v66',ASSETS=['./','index.html','styles.css','app.js','money-movements.js','bank-import.js','money-accounts.js','supabase-config.js','cloud-sync.js','manifest.webmanifest','moneybrain-logo.png','moneybrain-icon-192.png','moneybrain-icon-512.png','moneybrain-icon-maskable-512.png','statement-import.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs','receipt-import.js','paypal-import.js','vendor/tesseract.min.js','vendor/tesseract-worker.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method==='POST'&&url.pathname.endsWith('/share-target')){event.respondWith(receiveShare(event.request));return}
 if(event.request.method==='GET'&&event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('index.html',copy));return response}).catch(()=>caches.match('index.html')));
  return;
 }
 if(event.request.method==='GET')event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
async function receiveShare(request){
 try{const data=await request.formData(),files=data.getAll('files').filter(value=>value instanceof File);await writeShared({title:String(data.get('title')||''),text:String(data.get('text')||''),url:String(data.get('url')||''),files});return Response.redirect(new URL('./?shared=1',self.registration.scope).href,303)}
 catch{return Response.redirect(new URL('./?shareError=1',self.registration.scope).href,303)}
}
function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('moneybrain-share',1);request.onupgradeneeded=()=>request.result.createObjectStore('inbox',{keyPath:'id',autoIncrement:true});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function writeShared(item){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('inbox','readwrite');tx.objectStore('inbox').add({...item,receivedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)})}

