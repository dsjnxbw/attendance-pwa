const CACHE_NAME = "ot-mobile-v4";
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
        caches.keys().then((keys) => {
            // 删除所有旧缓存
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => {
                    console.log("删除旧缓存:", k);
                    return caches.delete(k);
                })
            );
        })
    );
    self.clients.claim();
    // 通知所有客户端进行更新
    self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
            client.postMessage({ type: "CACHE_UPDATED" });
        });
    });
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
