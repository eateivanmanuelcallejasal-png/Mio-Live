const CACHE = 'mio-live-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.json', 'icons/icon.svg', 'icons/logo.png', 'icons/icon-192.png',
  'js/main.js', 'js/util.js', 'js/supa.js', 'js/auth.js', 'js/home.js', 'js/catalogo.js',
  'js/sala.js', 'js/perfil.js', 'js/vender.js', 'js/pedidos.js', 'js/puntos.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Datos, auth y fotos siempre por red; solo el "cascarón" de la app usa caché.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('config.js')) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
