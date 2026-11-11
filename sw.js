/* ROUTA – service worker : l'app s'ouvre même avec un réseau faible. */
const CACHE = 'routa-v0.9.17';
const SHELL = ['./', './index.html', './style.css', './app.js', './native.js', './extra.js', './i18n-a.js', './i18n-c.js', './i18n-d.js', './i18n.js', './config.js', './countries.js', './aide.html', './confidentialite.html', './i18n-e.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
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
