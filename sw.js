const CACHE_NAME = "tvattis-v3";
const CORE_FILES = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./raccoons/idle-upright.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Nätverk först så nya versioner alltid når telefonen direkt, cachen är bara offline-reserv.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Tvättis 🦝", body: "Tänkte på dig! ❤️" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Tvättis 🦝", {
      body: data.body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      vibrate: [80, 40, 80],
      // unik tag per notis, annars skriver en ny kärlekshälsning över den förra
      tag: "tvattis-" + Date.now(),
      renotify: true,
      data: { url: "./index.html" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
