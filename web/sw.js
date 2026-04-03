const CACHE_NAME = 'dresscode-v29';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './css/app.css?v=29',
  './js/app.js?v=32',
  './js/weather.js?v=29',
  './js/business.js?v=29',
  './js/payments.js?v=29',
  './js/tasks.js?v=29',
  './js/agents.js?v=29',
  './js/daily.js?v=29',
  './agents-config.json',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network first for API calls — cache responses for offline fallback
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache first for static assets — much faster startup
  event.respondWith(
    caches.match(event.request).then(cached => {
      // Return cache immediately, update in background
      const fetchPromise = fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
