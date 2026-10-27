/**
 * Hijri (Islamic Umm al-Qura) calendar helpers.
 *
 * Everything derives from `Intl.DateTimeFormat` with the islamic-umalqura
 * calendar, so there are no month-length tables to maintain and no new
 * dependencies. All user-visible names come from `Intl` itself (locale aware)
 * or from the app locale dictionaries — never from literals here.
 */

export type HijriDate = {
  day: number;
  /** 1-based month (1 = Muharram … 9 = Ramadan … 12 = Dhu al-Hijjah). */
  month: number;
  year: number;
};

function partsOf(date: Date): HijriDate {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    const n = p ? Number(p.value.replace(/[^0-9]/g, "")) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** Today's Hijri date in the device timezone. */
export function todayHijri(now = new Date()): HijriDate {
  return partsOf(now);
}

/** Localised "12 Ramadan 1447"-style label, honouring the app locale. */
export function formatHijri(h: HijriDate, locale: string): string {
  // Reconstruct a Gregorian anchor for the same Hijri day so Intl can render
  // the month name in the requested language. We walk back from today: the
  // anchor loop below is bounded (one Hijri year) and only used for names.
  const probe = new Date();
  for (let back = 0; back < 370; back += 1) {
    const cand = new Date(probe.getFullYear(), probe.getMonth(), probe.getDate() - back);
    const hp = partsOf(cand);
    if (hp.day === h.day && hp.month === h.month && hp.year === h.year) {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(cand);
    }
  }
  return `${h.day}/${h.month}/${h.year}`;
}

export function isRamadan(h: HijriDate): boolean {
  return h.month === 9;
}

/** True during the last ten nights of Ramadan (month 9, day >= 21). */
export function isLastTenNights(h: HijriDate): boolean {
  return h.month === 9 && h.day >= 21;
}

/** 0-based day of the Gregorian year, for deterministic daily rotation. */
export function dayOfYear(now = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export type Occasion = {
  id: string;
  month: number;
  day: number;
  /** Extra days the occasion spans starting from (month, day). */
  span?: number;
  titleKey: string;
  descKey: string;
};

/** Fixed-date Hijri occasions shown by the radar (titles live in locale). */
export const OCCASIONS: Occasion[] = [
  { id: "muharram-1", month: 1, day: 1, titleKey: "occ.muharram1Title", descKey: "occ.muharram1Desc" },
  { id: "ashura", month: 1, day: 10, span: 1, titleKey: "occ.ashuraTitle", descKey: "occ.ashuraDesc" },
  { id: "mawlid", month: 3, day: 12, titleKey: "occ.mawlidTitle", descKey: "occ.mawlidDesc" },
  { id: "isra", month: 7, day: 27, titleKey: "occ.israTitle", descKey: "occ.israDesc" },
  { id: "shaban-15", month: 8, day: 15, titleKey: "occ.shaban15Title", descKey: "occ.shaban15Desc" },
  { id: "ramadan-1", month: 9, day: 1, titleKey: "occ.ramadan1Title", descKey: "occ.ramadan1Desc" },
  { id: "laylat-qadr", month: 9, day: 27, titleKey: "occ.qadrTitle", descKey: "occ.qadrDesc" },
  { id: "eid-fitr", month: 10, day: 1, span: 2, titleKey: "occ.fitrTitle", descKey: "occ.fitrDesc" },
  { id: "arafah", month: 12, day: 9, titleKey: "occ.arafahTitle", descKey: "occ.arafahDesc" },
  { id: "eid-adha", month: 12, day: 10, span: 3, titleKey: "occ.adhaTitle", descKey: "occ.adhaDesc" },
];

export type OccasionHit = {
  occasion: Occasion;
  /** 0 = today, 1 = tomorrow, … */
  daysAway: number;
};

/**
 * Walk the Gregorian calendar forward converting every day (bounded: one
 * Hijri year), so no month-length tables are ever needed. The matcher decides
 * whether a converted day hits a dated entry.
 */
function walkDated<T extends { id: string; month: number; day: number }>(
  entries: readonly T[],
  match: (entry: T, hijri: HijriDate) => boolean,
  now: Date,
): { entry: T; daysAway: number }[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const found = new Map<string, { entry: T; daysAway: number }>();
  for (let ahead = 0; ahead < 380 && found.size < entries.length; ahead += 1) {
    const cand = new Date(start.getFullYear(), start.getMonth(), start.getDate() + ahead);
    const hp = partsOf(cand);
    for (const e of entries) {
      if (!found.has(e.id) && match(e, hp)) found.set(e.id, { entry: e, daysAway: ahead });
    }
  }
  return [...found.values()].sort((a, b) => a.daysAway - b.daysAway);
}

/**
 * Next occurrence of every occasion, soonest first. Span days are attributed
 * to the start date only: for the 1–3 day spans here this only shifts the
 * highlighted window, never the date.
 */
export function upcomingOccasions(now = new Date(), limit = 4): OccasionHit[] {
  return walkDated(OCCASIONS, (o, hp) => hp.month === o.month && hp.day === o.day, now)
    .slice(0, limit)
    .map(({ entry, daysAway }) => ({ occasion: entry, daysAway }));
}

export type SeerahEvent = {
  id: string;
  month: number;
  day: number;
  titleKey: string;
  descKey: string;
};

/**
 * Universally-agreed Hijri milestones only: no debated exact dates and no
 * overlap with the occasions radar (Mawlid, Isra, Qadr, Eids, Arafah).
 */
export const SEERAH_EVENTS: SeerahEvent[] = [
  { id: "hijra-era", month: 1, day: 1, titleKey: "seerah.hijraTitle", descKey: "seerah.hijraDesc" },
  { id: "musa", month: 1, day: 10, titleKey: "seerah.musaTitle", descKey: "seerah.musaDesc" },
  { id: "quba", month: 3, day: 8, titleKey: "seerah.qubaTitle", descKey: "seerah.qubaDesc" },
  { id: "arrival", month: 3, day: 12, titleKey: "seerah.arrivalTitle", descKey: "seerah.arrivalDesc" },
  { id: "badr", month: 9, day: 17, titleKey: "seerah.badrTitle", descKey: "seerah.badrDesc" },
  { id: "fath", month: 9, day: 20, titleKey: "seerah.fathTitle", descKey: "seerah.fathDesc" },
];

export type SeerahHit = { event: SeerahEvent; daysAway: number };

/** The next Seerah milestone from today (exact-day hit has daysAway 0). */
export function seerahNext(now = new Date()): SeerahHit | null {
  const hits = walkDated(SEERAH_EVENTS, (e, hp) => hp.month === e.month && hp.day === e.day, now);
  const first = hits[0];
  return first ? { event: first.entry, daysAway: first.daysAway } : null;
}
