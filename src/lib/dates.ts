export const dateKey = (d: Date): string => d.toLocaleDateString("en-CA");

export const todayKey = (): string => dateKey(new Date());

export const parseKey = (key: string): Date => new Date(`${key}T00:00:00`);

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
