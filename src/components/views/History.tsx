"use client";

import { CalendarCheck2, History, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui";
import { addDays, formatArabicShort, parseKey } from "@/lib/dates";
import type { WardData } from "@/hooks/useWardData";

export function HistoryView({ data }: { data: WardData }) {
  const lastWeek = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(data.today, -(6 - i));
    const reading = data.history.find((item) => item.date === key);
    return {
      key,
      label: parseKey(key).toLocaleDateString("ar-EG", { weekday: "short" }),
      pages: reading?.pages ?? 0,
      done: reading?.completed === true,
      partial: reading !== undefined && !reading.completed,
    };
  });

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 pt-6">
      <h2 className="text-2xl font-black">سجل الورد</h2>

      {/* SUMMARY */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <SummaryCard label="هذا الأسبوع" value={`${data.weekRead}`} unit="صفحة" />
        <SummaryCard label="أيام الورد" value={`${data.totalDays}`} unit="يوم" />
        <SummaryCard label="إجمالي الصفحات" value={`${data.totalRead}`} unit="صفحة" />
      </div>

      {/* LAST 7 DAYS */}
      <p className="mb-2 mt-5 text-[11px] font-bold text-muted">آخر 7 أيام</p>
      <Card className="flex items-end justify-between gap-1 p-4">
        {lastWeek.map((day) => (
          <div key={day.key} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted">{day.label}</span>
            <div
              className={`flex h-8 w-full max-w-7 items-center justify-center rounded-lg text-[10px] font-black ${
                day.done
                  ? "bg-primary text-white"
                  : day.partial
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-2 text-muted"
              }`}
              title={`${day.pages} صفحة`}
            >
              {day.done || day.partial ? day.pages : "·"}
            </div>
            <span className="text-[9px] text-muted">{formatArabicShort(day.key)}</span>
          </div>
        ))}
      </Card>

      {/* LIST */}
      <div className="mb-2 mt-5 flex items-center justify-between">
        <p className="text-[11px] font-bold text-muted">التسجيلات</p>
        <span className="text-[10px] text-muted">{data.history.length} تسجيل</span>
      </div>

      {data.history.length === 0 ? (
        <Card className="p-10 text-center text-muted">
          <History size={30} className="mx-auto mb-3" />
          لا يوجد سجل بعد — ابدأ وردك اليوم
        </Card>
      ) : (
        <div className="space-y-2">
          {data.history.map((item) => (
            <Card key={item.id} className="flex items-center gap-3 p-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                  item.completed ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"
                }`}
              >
                <CalendarCheck2 size={18} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black">
                  {item.startPage} ← {item.endPage}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {formatArabicShort(item.date)} · الختمة {item.khatma}
                  {item.mode === "manual" && " · تعديل"} · {item.pages} صفحة
                  {!item.completed && " · جزئي"}
                </p>
              </div>
              <span className="text-xs font-black text-gold-strong">{item.pages}</span>
            </Card>
          ))}
        </div>
      )}

      {data.history.length > 0 && (
        <button
          type="button"
          onClick={data.undoLastReading}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-danger/30 bg-danger-soft text-xs font-bold text-danger transition active:scale-[0.98]"
        >
          <RotateCcw size={15} />
          التراجع عن آخر تسجيل
        </button>
      )}
    </div>
  );
}

function SummaryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <Card className="p-3.5 text-center">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="text-[9px] text-muted">{unit}</p>
    </Card>
  );
}
