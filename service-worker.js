const CACHE_NAME = "lenslog-v23";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=23",
  "./app.js?v=23",
  "./assets/photo-fallback.svg",
  "./assets/real-street-rain.jpg",
  "./assets/real-pangong-lake.jpg",
  "./assets/real-window-portrait.jpg",
  "./assets/real-heron-flight.jpg",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const destination = event.request.destination;
  const url = new URL(event.request.url);

  if (event.request.mode === "navigate" || destination === "script" || destination === "style" || url.pathname.endsWith(".html")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
