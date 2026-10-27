"use client";

import { Activity, CalendarDays, Flame, Share2, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Card, ScreenHeader } from "@/components/ui";
import { addDays, parseKey } from "@/lib/dates";
import { getWeekdayShort, useLocale } from "@/lib/locale";
import { shareWeekCard } from "@/lib/shareCard";
import type { WardData } from "@/hooks/useWardData";

export function StatsView({ data, onBack }: { data: WardData; onBack: () => void }) {
  const { t, locale } = useLocale();
  const avg = data.totalDays > 0 ? Math.round(data.totalRead / data.totalDays) : 0;

  const monthStart = addDays(data.today, -29);
  const monthRead = data.history
    .filter((item) => item.completed && item.date >= monthStart && item.date <= data.today)
    .reduce((sum, item) => sum + item.pages, 0);
  const monthDays = new Set(
    data.history
      .filter((item) => item.completed && item.date >= monthStart && item.date <= data.today)
      .map((item) => item.date)
  ).size;

  const bars = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(data.today, -(6 - i));
    const pages = data.history
      .filter((item) => item.completed && item.date === key)
      .reduce((sum, item) => sum + item.pages, 0);
    return { key, pages };
  });
  const maxBar = Math.max(1, ...bars.map((b) => b.pages));
  const weekPages = bars.reduce((sum, b) => sum + b.pages, 0);

  /** Plain-text share, kept as the fallback for platforms without file share. */
  const shareAsText = async () => {
    const text = t("stats.weekShareText", { n: weekPages, app: t("app.name") });
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to copy
      }
    }
    await navigator.clipboard.writeText(text);
  };

  const handleShareWeek = async () => {
    await shareWeekCard(
      {
        rows: [
          { label: t("stats.totalPages"), value: String(data.totalRead) },
          { label: t("stats.totalDays"), value: String(data.totalDays) },
          { label: t("stats.currentStreak"), value: String(data.streak) },
          { label: t("week.pages"), value: String(weekPages) },
        ],
        headline: t("stats.weekReport"),
        subline: t("stats.last7"),
        appName: t("app.name"),
        rtl: locale === "ar",
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      },
      shareAsText
    );
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-5">
      <ScreenHeader title={t("stats.title")} subtitle={t("stats.subtitle")} onBack={onBack} />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard
          icon={<Activity size={18} />}
          value={data.totalRead}
          label={t("stats.totalPages")}
          accent="bg-primary-soft text-primary"
        />
        <StatCard
          icon={<CalendarDays size={18} />}
          value={data.totalDays}
          label={t("stats.totalDays")}
          accent="bg-gold-soft text-gold-strong"
        />
        <StatCard
          icon={<Flame size={18} />}
          value={data.streak}
          label={t("stats.currentStreak")}
          accent="bg-orange-100 text-orange-500 dark:bg-orange-500/15"
        />
        <StatCard
          icon={<Trophy size={18} />}
          value={data.bestStreak}
          label={t("stats.bestStreak")}
          accent="bg-gold-soft text-gold-strong"
        />
      </div>

      <Card className="mt-3 flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] text-muted">{t("stats.avgReading")}</p>
          <p className="text-xl font-black">
            {avg} {t("stats.avgUnit")}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[11px] text-muted">{t("stats.last30")}</p>
          <p className="text-xl font-black">
            {monthRead} {t("week.pages")}
          </p>
          <p className="text-[10px] text-muted">{t("stats.daysCount", { n: monthDays })}</p>
        </div>
      </Card>

      {/* BAR CHART */}
      <p className="mb-2 mt-5 text-[11px] font-bold text-muted">{t("stats.last7")}</p>
      <Card className="p-4">
        <div className="flex h-32 items-end justify-between gap-2">
          {bars.map((bar) => (
            <div key={bar.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9px] font-bold text-muted">{bar.pages || ""}</span>
              <div
                className={`w-full max-w-8 rounded-t-lg transition-all ${
                  bar.pages > 0 ? "bg-gradient-to-t from-primary to-primary/60" : "bg-surface-2"
                }`}
                style={{ height: `${bar.pages > 0 ? Math.max(8, (bar.pages / maxBar) * 100) : 4}%` }}
              />
              <span className="text-[9px] text-muted">
                {getWeekdayShort(locale, parseKey(bar.key))}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-3 p-4">
        <p className="text-sm font-black">{t("stats.khatma")}</p>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>{t("stats.khatmaN", { n: data.settings.khatmaNumber })}</span>
          <span>
            {t("stats.pageOf", {
              from: data.startPage,
              to: data.settings.totalPages,
            })}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gold transition-all duration-500"
            style={{ width: `${data.khatmaPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-bold text-primary">
          {data.khatmaPercent}% {t("stats.completed")}
        </p>
      </Card>

      <button
        type="button"
        onClick={() => void handleShareWeek()}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-md transition active:scale-[0.98]"
      >
        <Share2 size={16} />
        {t("stats.shareWeek")}
      </button>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  accent: string;
}) {
  return (
    <Card className="p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accent}`}>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-black">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </Card>
  );
}
