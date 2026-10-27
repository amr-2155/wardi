export const dateKey = (d: Date): string => d.toLocaleDateString("en-CA");

export const todayKey = (): string => dateKey(new Date());

export const parseKey = (key: string): Date => new Date(`${key}T00:00:00`);

/**
 * Milliseconds from `now` until the next LOCAL midnight.
 *
 * Deliberately not a fixed 24h: a daylight-saving transition makes a 24h timer
 * land an hour early or late, which would roll the active date at the wrong
 * time. Computing the next local midnight and re-arming after each fire keeps
 * the rollover correct across DST. The 1s floor stops a zero/negative delay
 * (clock skew, or a device waking exactly at midnight) from spinning the timer.
 */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

export const addDays = (key: string, n: number): string => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const daysBetween = (startKey: string, endKey: string): number =>
  Math.round((parseKey(endKey).getTime() - parseKey(startKey).getTime()) / 86400000);

export const formatArabicDate = (key: string): string =>
  parseKey(key).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });

export const formatArabicShort = (key: string): string =>
  parseKey(key).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

export const formatArabicFull = (key: string): string =>
  parseKey(key).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
