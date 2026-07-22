/* Arise — Service Worker (أوفلاين كامل) */
const V = "arise-v8";
const CORE = ["./", "./index.html", "./manifest.json", "./icon-511.png", "./apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(V).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))
    )
  );
});
