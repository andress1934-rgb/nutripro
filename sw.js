const CACHE = 'nutripro-v69';
const FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './firebase.js',
  './manifest.json',
  './terminos.html',
  './privacidad.html',
  './body-front.png',
  './body-back.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  /* SIN .catch(): si el precache falla (p. ej. sin señal a mitad de la
     actualización), la instalación debe FALLAR para que el SW viejo siga
     sirviendo. Tragarse el error activaba un SW con caché vacío que además
     borraba el caché anterior → pantalla blanca al abrir offline. */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
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

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  /* Imágenes propias (mapa corporal): CACHE-FIRST. Van versionadas con ?v=N
     así que el caché nunca queda viejo, y re-bajarlas en cada apertura era lo
     que hacía tardar segundos al muñequito. ignoreSearch: el precache guarda
     body-front.png sin query pero la app pide ?v=N. */
  if (sameOrigin && /\.png(\?|$)/.test(req.url)) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit =>
        hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
    return;
  }

  /* Para archivos propios (mismo origen) se fuerza red SIN pasar por el caché
     HTTP del navegador (GitHub Pages cachea el HTML ~10 min, lo que retrasaba
     ver los cambios). Cross-origin (Firebase, fuentes) va normal. */
  const net = sameOrigin ? fetch(req.url, { cache: 'reload' }) : fetch(req);

  e.respondWith(
    net
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        /* ignoreSearch: el precache guarda styles.css SIN query pero la app
           pide styles.css?v=N — sin esto, tras cada bump de versión la
           primera apertura offline quedaba sin CSS/JS (pantalla blanca). */
        caches.match(req, { ignoreSearch: true }).then(r =>
          r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
