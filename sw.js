// Service worker: guarda en caché SOLO el "cascarón" público de la app (nunca datos del colegio ni llamadas a la API).
const V = 'sigutp-v22';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'js/app.js', 'js/store.js', 'js/logic.js', 'js/ui.js', 'js/io.js', 'js/pdf.js', 'js/plan.js', 'vendor/jspdf.min.js', 'vendor/outfit.woff2', 'vendor/outfit-regular.ttf', 'vendor/outfit-semibold.ttf', 'vendor/outfit-bold.ttf', 'vendor/xlsx.min.js', 'icons/icon.svg', 'icons/escudo.png', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API y Google: siempre red
  // Red primero (para recibir actualizaciones), caché como respaldo sin conexión.
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
