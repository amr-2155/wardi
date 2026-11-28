/**
 * Asbab al-Nuzul (occasions of revelation) loader.
 *
 * Source: al-Wahidi's Asbab al-Nuzul via the MIT-licensed dataset
 * mostafaahmed97/asbab-al-nuzul-dataset, bundled at /quran/asbab.json by
 * scripts (see public/quran/asbab.json "source"). Coverage is partial by
 * nature: most ayahs have no attested occasion, and callers must render the
 * honest "no specific occasion" line instead of guessing.
 */
export type AsbabData = {
  version: string;
  source: string;
  entries: Record<string, string[]>;
};

let cache: AsbabData | null = null;
let inflight: Promise<AsbabData | null> | null = null;

export function loadAsbab(): Promise<AsbabData | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/quran/asbab.json")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: AsbabData | null) => {
      if (data && typeof data === "object" && data.entries && typeof data.entries === "object") {
        cache = data;
        return data;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function asbabFor(data: AsbabData | null, ref: string): string[] {
  if (!data) return [];
  const occ = data.entries[ref];
  return Array.isArray(occ) ? occ.filter((t) => typeof t === "string" && t.trim().length > 0) : [];
}
