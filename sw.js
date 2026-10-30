const V='agenda-v10',FILES=['./','index.html','style.css','app.js','config.js','manifest.json','vencraft_logo_complet.png','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
/* installation : on met tout en cache tout de suite, sans attendre */
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>Promise.allSettled(FILES.map(f=>c.add(f)))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
/* ouverture instantanée : le cache répond d'abord, la mise à jour se fait en arrière-plan (plus de réseau lent qui bloque) */
self.addEventListener('fetch',e=>{
  const q=e.request;
  if(q.method!=='GET'||new URL(q.url).origin!==location.origin)return;
  e.respondWith(caches.open(V).then(c=>c.match(q,{ignoreSearch:true}).then(hit=>{
    const net=fetch(q).then(r=>{if(r&&r.ok)c.put(q,r.clone());return r}).catch(()=>null);
    if(hit){e.waitUntil(net);return hit}
    return net.then(r=>r||c.match('index.html')||c.match('./')||new Response('Hors ligne',{status:503}))
  })))
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():clients.openWindow('./')))});