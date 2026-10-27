/**
 * After-prayer micro-ward: two pages after each fard prayer.
 *
 * A pure reminder checklist — deliberately NOT coupled to ward progress, so a
 * checked box can never double-count pages or disturb the ward accounts. Own
 * localStorage key (userData.ts is hash-frozen), date-scoped like adhkar
 * counts so yesterday's checks never carry over.
 */
import { PRAYERS_ADHAN, type PrayerId } from "@/lib/prayer";

const KEY = "ward:v2:after-prayer:v1";

export const AFTER_PRAYERS: PrayerId[] = [...PRAYERS_ADHAN];

export function loadAfterPrayer(dateKey: string): PrayerId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date?: unknown; done?: unknown };
    if (parsed.date !== dateKey || !Array.isArray(parsed.done)) return [];
    return parsed.done.filter((p): p is PrayerId => typeof p === "string");
  } catch {
    return [];
  }
}

export function toggleAfterPrayer(dateKey: string, prayer: PrayerId): PrayerId[] {
  const done = loadAfterPrayer(dateKey);
  const next = done.includes(prayer) ? done.filter((p) => p !== prayer) : [...done, prayer];
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: dateKey, done: next }));
  } catch {
    /* Private-mode storage can throw; the checkbox simply won't persist. */
  }
  return next;
}
