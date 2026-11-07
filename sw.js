// Tiene in cache solo il guscio dell'app: nessun contenuto del manuale passa da qui.
const VERSION = 'mt-e4f1b63d8809';
const ASSETS = [
  './',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './index.html',
  './js/app.js',
  './js/calc.js',
  './js/doc.js',
  './js/edit.js',
  './js/entries.js',
  './js/facets.js',
  './js/forms.js',
  './js/gate.js',
  './js/icons.js',
  './js/inline.js',
  './js/motion.js',
  './js/quiz.js',
  './js/recent.js',
  './js/remote.js',
  './js/search.js',
  './js/session.js',
  './js/sheet.js',
  './js/store.js',
  './js/sync.js',
  './js/theme.js',
  './js/ui.js',
  './js/vault.js',
  './js/views-tools.js',
  './js/views.js',
  './manifest.json',
  './style.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // Il dominio può ospitare altre app: si toccano solo le proprie versioni.
      .then(keys => Promise.all(keys.filter(key => key.startsWith('mt-') && key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(hit => hit ?? fetch(request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return res;
      })
      .catch(err => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw err;
      })),
  );
});
