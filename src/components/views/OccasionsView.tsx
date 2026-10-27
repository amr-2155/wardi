"use client";

import { ArrowLeft, CalendarDays, MoonStar } from "lucide-react";
import { useMemo } from "react";
import { useLocale } from "@/lib/locale";
import { formatHijri, todayHijri, upcomingOccasions } from "@/lib/hijri";

/**
 * Hijri occasions radar: what is happening now in the Islamic calendar and
 * what is coming next. All dates derive from `Intl` (islamic-umalqura), all
 * labels from the locale dictionaries.
 */
export function OccasionsView({ onBack }: { onBack: () => void }) {
  const { t, locale } = useLocale();
  const hijri = useMemo(() => todayHijri(), []);
  const label = useMemo(() => formatHijri(hijri, locale), [hijri, locale]);
  const hits = useMemo(() => upcomingOccasions(), []);

  const when = (daysAway: number): string => {
    if (daysAway === 0) return t("occ.today");
    if (daysAway === 1) return t("occ.tomorrow");
    return t("occ.daysAway", { n: daysAway });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 animate-fade-slide-up">
      <header className="flex items-center gap-3 pb-4 pt-6 animate-fade-up">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("ui.back")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-muted shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={19} className="rtl:rotate-180" />
        </button>
        <div className="flex items-center gap-2">
          <MoonStar size={22} className="text-gold-strong" />
          <div>
            <h1 className="display-md text-ink">{t("occ.title")}</h1>
            <p className="text-[11px] text-muted">
              {t("occ.subtitle")} · {label}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-2 flex flex-col gap-2.5">
        {hits.map((hit, i) => (
          <article
            key={hit.occasion.id}
            className={`animate-fade-up rounded-[22px] border p-4 shadow-sm ${
              hit.daysAway === 0
                ? "border-gold/40 bg-gold-soft"
                : "border-line bg-surface"
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-black text-ink">
                <CalendarDays size={15} className="shrink-0 text-gold-strong" />
                {t(hit.occasion.titleKey)}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                  hit.daysAway === 0
                    ? "bg-gold text-primary-deep"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {when(hit.daysAway)}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-muted">
              {t(hit.occasion.descKey)}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
