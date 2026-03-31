const CACHE_NAME = "ot-mobile-v1";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./app_mobile.js",
    "./manifest.webmanifest",
    "./icon.svg"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((resp) => {
                const cloned = resp.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                return resp;
            }).catch(() => caches.match("./index.html"));
        })
    );
});
