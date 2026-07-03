const CACHE = 'nutripro-v50';
const FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './firebase.js',
  './manifest.json',
  './body-front.png',
  './body-back.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Network-first para TODO: con conexión siempre se sirve la versión fresca
   (HTML, CSS, JS, imágenes); el caché solo actúa como respaldo sin red.
   Así los cambios se ven con una sola recarga y nunca queda CSS/JS viejo pegado. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* Para archivos propios (mismo origen) se fuerza red SIN pasar por el caché
     HTTP del navegador (GitHub Pages cachea el HTML ~10 min, lo que retrasaba
     ver los cambios). Cross-origin (Firebase, fuentes) va normal. */
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  const net = sameOrigin ? fetch(req.url, { cache: 'reload' }) : fetch(req);

  e.respondWith(
    net
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then(r =>
          r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
