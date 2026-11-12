/* ROUTA – service worker : l'app s'ouvre même avec un réseau faible. */
const CACHE = 'routa-v0.9.41';
const MAPC = 'routa-map';
const SHELL = ['./', './index.html', './style.css', './app.js', './native.js', './extra.js', './i18n-a.js', './i18n-c.js', './i18n-d.js', './i18n.js', './config.js', './countries.js', './aide.html', './confidentialite.html', './i18n-e.js', './i18n-f.js', './i18n-g.js', './i18n-h.js', './zfe.js', './plus.js', './pro.js', './more.js', './i18n-p.js', './i18n-m.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== MAPC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Carte : réseau d'abord ; sans réseau, la carte téléchargée de la région.
  if (e.request.method === 'GET' && url.hostname === 'tiles.openfreemap.org') {
    const tile = /\.pbf$/.test(url.pathname);
    e.respondWith(fetch(e.request).then((r) => {
      if (!tile && r.ok) { const copy = r.clone(); caches.open(MAPC).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return r;
    }).catch(() => caches.open(MAPC).then((c) => c.match(e.request.url)).then((r) => r || Response.error())));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Réseau d'abord (toujours la dernière version), cache si pas de réseau.
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
