const prefix = 'money-grow:'+self.registration.scope+':'
const cacheName = prefix+'v4'
const files = ['./','./index.html','./style.css','./app.mjs','./engine.mjs','./storage.mjs','./labels.mjs','./manifest.webmanifest','./icon-192.png','./icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(files.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys()
    await Promise.all(keys.filter(key=>key.startsWith(prefix)&&key!==cacheName).map(key=>caches.delete(key)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return
  const url=new URL(event.request.url)
  if(!url.href.startsWith(self.registration.scope)) return
  if(event.request.mode==='navigate') {
    event.respondWith(caches.open(cacheName).then(cache=>cache.match('./index.html')).then(hit=>hit||fetch(event.request)))
  } else if(files.some(file=>new URL(file,self.registration.scope).href===url.href)) {
    event.respondWith(caches.open(cacheName).then(cache=>cache.match(event.request)).then(hit=>hit||fetch(event.request)))
  }
})
