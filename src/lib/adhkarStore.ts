import { todayKey } from "./dates";

const V2_ADHKAR_COUNTS = "ward:v2:adhkar-counts";
const V2_ADHKAR_FAVORITES = "ward:v2:adhkar-favorites";
const V2_NIYYAH = "ward:v2:niyyah";

export type AdhkarCounts = {
  date: string;
  items: Record<string, number>;
};

export type NiyyahItem = {
  id: string;
  title: string;
  note: string;
  category: string;
  createdAt: string;
};

export function loadAdhkarCounts(): AdhkarCounts {
  try {
    const raw = JSON.parse(localStorage.getItem(V2_ADHKAR_COUNTS) ?? "null") as AdhkarCounts | null;
    if (raw && typeof raw === "object" && typeof raw.date === "string" && raw.items && typeof raw.items === "object") {
      const items: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw.items)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) items[k] = Math.floor(n);
      }
      return { date: raw.date, items };
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), items: {} };
}

export function saveAdhkarCounts(state: AdhkarCounts): void {
  try {
    localStorage.setItem(V2_ADHKAR_COUNTS, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadSingleDhikrCount(itemId: string, date: string): number {
  const counts = loadAdhkarCounts();
  if (counts.date !== date) return 0;
  return counts.items[itemId] ?? 0;
}

export function bumpDhikrCount(itemId: string, date: string, next: number): void {
  const counts = loadAdhkarCounts();
  const base = counts.date === date ? counts : { date, items: {} };
  saveAdhkarCounts({ date: base.date, items: { ...base.items, [itemId]: Math.max(0, Math.floor(next)) } });
}

export function loadAdhkarFavorites(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(V2_ADHKAR_FAVORITES) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveAdhkarFavorites(ids: string[]): void {
  try {
    localStorage.setItem(V2_ADHKAR_FAVORITES, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function loadNiyyahItems(): NiyyahItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(V2_NIYYAH) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (v): v is NiyyahItem =>
          !!v &&
          typeof v === "object" &&
          typeof (v as NiyyahItem).id === "string" &&
          typeof (v as NiyyahItem).title === "string"
      )
      .map((v) => ({
        id: v.id,
        title: v.title,
        note: typeof v.note === "string" ? v.note : "",
        category: typeof v.category === "string" ? v.category : "",
        createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function saveNiyyahItems(items: NiyyahItem[]): void {
  try {
    localStorage.setItem(V2_NIYYAH, JSON.stringify(items.slice(-200)));
  } catch {
    /* ignore */
  }
}