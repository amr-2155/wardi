"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // No service worker is registered by this app anymore: the UI ships
    // inside the APK and `install -r` keeps WebView storage, so a stale
    // worker + cache would pin the previous bundle forever. Clean up any
    // leftovers once, then reload a single time to boot the fresh shell.
    if (!("serviceWorker" in navigator)) return;
    let dead = false;
    const FLAG = "ward:sw-purged-v2";
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        if (dead || regs.length === 0) return;
        return Promise.all(regs.map((r) => r.unregister().catch(() => false))).then(
          () => {
            const clear =
              typeof caches !== "undefined"
                ? caches
                    .keys()
                    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
                    .catch(() => [])
                : Promise.resolve([]);
            return clear.finally(() => {
              if (dead) return;
              try {
                if (!window.localStorage.getItem(FLAG)) {
                  window.localStorage.setItem(FLAG, "1");
                  window.location.reload();
                }
              } catch {
                /* storage blocked — stay on this shell */
              }
            });
          },
        );
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      dead = true;
    };
  }, []);
  return null;
}