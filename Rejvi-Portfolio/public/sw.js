const CACHE='rejvi-portfolio-v5';
const SHELL=['/','/style.css','/app.js','/shared.js','/theme.css','/favicon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
async function staleWhileRevalidate(request,fallback){
 const cache=await caches.open(CACHE),cached=await cache.match(request)||fallback&&await cache.match(fallback);
 const fresh=fetch(request).then(async response=>{if(response&&response.ok)await cache.put(request,response.clone());return response;}).catch(()=>null);
 if(cached){fresh.then(()=>{});return cached;}
 return await fresh||new Response('Offline',{status:503,headers:{'Content-Type':'text/plain'}});
}
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
 if(req.mode==='navigate'){event.respondWith(staleWhileRevalidate(req,'/'));return;}
 if(url.pathname==='/api/content'||url.pathname==='/api/articles'){event.respondWith(staleWhileRevalidate(req));return;}
 if(SHELL.includes(url.pathname)||['script','style','image','font'].includes(req.destination)){event.respondWith(staleWhileRevalidate(req));}
});