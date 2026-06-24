const CACHE_NAME = "evercam-installer-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png"
];

function isCacheableAppRequest(request) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  if (url.pathname.startsWith("/api/")) {
    return false;
  }

  if (url.pathname === "/manifest.webmanifest") {
    return false;
  }

  return APP_SHELL.includes(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (!isCacheableAppRequest(request)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });

      return cachedResponse || networkResponse;
    })
  );
});
