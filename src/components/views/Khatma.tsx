"use client";

import { BookHeart, Check, Plus, Sparkles } from "lucide-react";
import { ProgressRing } from "@/components/ProgressRing";
import { Card } from "@/components/ui";
import { formatArabicShort } from "@/lib/dates";
import type { WardData } from "@/hooks/useWardData";

export function KhatmaView({ data }: { data: WardData }) {
  const finished = new Map<number, { date: string; pages: number }>();
  for (const reading of data.history) {
    if (reading.completed && reading.endPage >= data.settings.totalPages) {
      if (!finished.has(reading.khatma)) {
        finished.set(reading.khatma, { date: reading.date, pages: reading.pages });
      }
    }
  }
  const completedList = [...finished.entries()].sort((a, b) => a[0] - b[0]);
  const khatmaRemaining = data.settings.totalPages - data.startPage + 1;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 pt-6">
      <h2 className="text-2xl font-black">ختماتي</h2>
      <p className="mt-1 text-[11px] text-muted">
        {completedList.length > 0
          ? `أنجزت ${completedList.length} ختمة كاملة — ما شاء الله 🌿`
          : "ابدأ ختمتك الأولى واستمر"}
      </p>

      {/* CURRENT KHATMA */}
      <section className="relative mt-4 overflow-hidden rounded-[28px] bg-primary p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -end-14 -top-14 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <ProgressRing
            percent={data.khatmaPercent}
            size={104}
            stroke={8}
            track="rgba(255,255,255,0.15)"
            bar="var(--gold)"
            className="shrink-0"
            label={
              <span className="text-xl font-black text-white">{data.khatmaPercent}%</span>
            }
          />
          <div>
            <p className="text-[11px] text-white/60">الختمة الحالية</p>
            <p className="text-3xl font-black">الختمة {data.settings.khatmaNumber}</p>
            <p className="mt-1 text-[11px] text-white/70">
              صفحة {data.startPage} من {data.settings.totalPages}
            </p>
            <p className="mt-0.5 text-[11px] text-gold">متبقي {khatmaRemaining} صفحة</p>
          </div>
        </div>
      </section>

      {/* START NEW */}
      <button
        type="button"
        onClick={data.startNewKhatma}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-white transition active:scale-[0.98]"
      >
        <Plus size={18} />
        بدء ختمة جديدة
      </button>

      {/* COMPLETED LIST */}
      <div className="mb-2 mt-5 flex items-center gap-1.5">
        <BookHeart size={15} className="text-gold-strong" />
        <p className="text-[11px] font-bold text-muted">الختمات المكتملة</p>
      </div>

      {completedList.length === 0 ? (
        <Card className="p-8 text-center">
          <Sparkles size={28} className="mx-auto mb-3 text-gold-strong" />
          <p className="text-sm font-bold">لم تكمل ختمة بعد</p>
          <p className="mt-1 text-[11px] text-muted">
            استمر على وردك اليومي وستكمل أول ختمة قريبًا
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {completedList.map(([khatma, info]) => (
            <Card key={khatma} className="flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success">
                <Check size={20} strokeWidth={3} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black">الختمة {khatma} — مكتملة ✓</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  أتممتها في {formatArabicShort(info.date)} · {info.pages} صفحة للورد الأخير
                </p>
              </div>
              <span className="rounded-full bg-gold-soft px-3 py-1 text-[10px] font-bold text-gold-strong">
                ما شاء الله 🌿
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
