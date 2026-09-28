/* Retired service worker (v2): the app ships its UI inside the APK and must
   always load fresh files after an update. Any previously installed worker
   self-destructs here: clear every cache, unregister, and reload clients
   once so the new shell takes effect immediately. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        await self.registration.unregister();
        await Promise.all(
          clients.map((c) => {
            try {
              return c.navigate(c.url);
            } catch {
              return Promise.resolve();
            }
          }),
        );
      } catch {
        try {
          await self.registration.unregister();
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});
