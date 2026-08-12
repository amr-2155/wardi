"use client";

import { Activity, CalendarDays, Flame, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Card, ScreenHeader } from "@/components/ui";
import { addDays, parseKey } from "@/lib/dates";
import type { WardData } from "@/hooks/useWardData";

export function StatsView({ data, onBack }: { data: WardData; onBack: () => void }) {
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

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-5">
      <ScreenHeader title="الإحصائيات" subtitle="نظرة على رحلتك" onBack={onBack} />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard
          icon={<Activity size={18} />}
          value={data.totalRead}
          label="إجمالي الصفحات"
          accent="bg-primary-soft text-primary"
        />
        <StatCard
          icon={<CalendarDays size={18} />}
          value={data.totalDays}
          label="أيام الورد"
          accent="bg-gold-soft text-gold-strong"
        />
        <StatCard
          icon={<Flame size={18} />}
          value={data.streak}
          label="السلسلة الحالية"
          accent="bg-orange-100 text-orange-500 dark:bg-orange-500/15"
        />
        <StatCard
          icon={<Trophy size={18} />}
          value={data.bestStreak}
          label="أفضل سلسلة"
          accent="bg-gold-soft text-gold-strong"
        />
      </div>

      <Card className="mt-3 flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] text-muted">متوسط قراءتك</p>
          <p className="text-xl font-black">{avg} صفحة / يوم</p>
        </div>
        <div className="text-left">
          <p className="text-[11px] text-muted">آخر 30 يوم</p>
          <p className="text-xl font-black">{monthRead} صفحة</p>
          <p className="text-[10px] text-muted">في {monthDays} يوم</p>
        </div>
      </Card>

      {/* BAR CHART */}
      <p className="mb-2 mt-5 text-[11px] font-bold text-muted">آخر 7 أيام — الصفحات</p>
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
                {parseKey(bar.key).toLocaleDateString("ar-EG", { weekday: "short" })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-3 p-4">
        <p className="text-sm font-black">ختمتك الحالية</p>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>الختمة {data.settings.khatmaNumber}</span>
          <span>
            صفحة {data.startPage} من {data.settings.totalPages}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gold transition-all duration-500"
            style={{ width: `${data.khatmaPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-bold text-primary">{data.khatmaPercent}% مكتمل</p>
      </Card>
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
