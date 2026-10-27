/**
 * Khatma reward dedications ("إهداء الثواب").
 *
 * Own localStorage key (same precedent as onboarding/freezes): userData.ts is
 * hash-frozen, so new UI-chrome state must not join its registry. Maps a
 * finished khatma number to the person its reward is gifted to.
 */

const KEY = "ward:v2:dedications:v1";

export type Dedication = { name: string; at: string };
export type DedicationMap = Record<string, Dedication>;

export function loadDedications(): DedicationMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: DedicationMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v === "object") {
        const name = (v as { name?: unknown }).name;
        const at = (v as { at?: unknown }).at;
        if (typeof name === "string" && name.trim()) {
          out[k] = { name: name.trim(), at: typeof at === "string" ? at : "" };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDedication(khatma: number, name: string): DedicationMap {
  const next = { ...loadDedications(), [String(khatma)]: { name: name.trim(), at: new Date().toISOString() } };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private-mode storage can throw; the chip simply won't persist. */
  }
  return next;
}
