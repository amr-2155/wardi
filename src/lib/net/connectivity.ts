/**
 * Connectivity awareness — lightweight, no global state system.
 *
 * Plain functions for non-React code (provider logic, fetch wrappers) plus
 * one tiny hook for components. Server-safe: without `navigator`/`window`
 * everything degrades to "online" / no-op unsubscribe.
 */

import { useEffect, useState } from "react";

/** Current connectivity snapshot. Unknown environments report online. */
export function isOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

export type ConnectivityListener = (online: boolean) => void;

/**
 * Subscribe to online/offline transitions.
 * Returns an unsubscribe function. No-op (with a no-op unsubscriber)
 * outside the browser.
 */
export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const onOnline = (): void => listener(true);
  const onOffline = (): void => listener(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

/** Component-level connectivity flag (local state only, no store). */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState<boolean>(() => isOnline());
  useEffect(() => subscribeConnectivity(setOnline), []);
  return online;
}
