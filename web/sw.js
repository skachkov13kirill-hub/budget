const CACHE_NAME = 'dresscode-v27';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './css/app.css?v=27',
  './js/app.js?v=27',
  './js/weather.js?v=27',
  './js/business.js?v=27',
  './js/payments.js?v=27',
  './js/tasks.js?v=27',
  './js/agents.js?v=27',
  './js/daily.js?v=27',
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
  // Network first for API calls + cache successful responses for offline
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

  // NETWORK FIRST for all assets — always try fresh, fallback to cache
  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
