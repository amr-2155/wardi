"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * App accent themes (gold/emerald/sapphire/maroon).
 *
 * The whole app reads its accent from `--gold*` CSS variables, so switching
 * accents is one `data-accent` attribute on <html> — no component changes.
 * Own localStorage key (userData.ts is hash-frozen).
 */

export type AccentId = "gold" | "emerald" | "sapphire" | "maroon";

const KEY = "ward:v2:accent:v1";

export const ACCENTS: readonly AccentId[] = ["gold", "emerald", "sapphire", "maroon"];

export function loadAccent(): AccentId {
  try {
    const raw = localStorage.getItem(KEY);
    const id = raw ? (JSON.parse(raw) as unknown) : "gold";
    return ACCENTS.includes(id as AccentId) ? (id as AccentId) : "gold";
  } catch {
    return "gold";
  }
}

export function applyAccentClass(id: AccentId): void {
  document.documentElement.dataset.accent = id;
}

export function useAccent(): [AccentId, (id: AccentId) => void] {
  const [accent, setAccentRaw] = useState<AccentId>("gold");
  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe load from localStorage */
  useEffect(() => {
    const saved = loadAccent();
    setAccentRaw(saved);
    applyAccentClass(saved);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const setAccent = useCallback((id: AccentId) => {
    setAccentRaw(id);
    applyAccentClass(id);
    try {
      localStorage.setItem(KEY, JSON.stringify(id));
    } catch {
      /* Private-mode storage can throw; the accent simply won't persist. */
    }
  }, []);
  return [accent, setAccent];
}
