"use client";

import { Check, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { ProgressRing } from "@/components/ProgressRing";
import { Card, ScreenHeader } from "@/components/ui";
import { formatArabicFull } from "@/lib/dates";
import type { WardData } from "@/hooks/useWardData";

export function ReadingModeView({
  data,
  onBack,
}: {
  data: WardData;
  onBack: () => void;
}) {
  const [customPage, setCustomPage] = useState(data.startPage + data.todayProgress);
  const currentPage = data.startPage + data.todayProgress;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-5">
      <ScreenHeader title="وضع القراءة" subtitle="ركز على صفحتك في ورد اليوم" onBack={onBack} />

      <div className="mt-5 animate-fade-up">
        {/* CURRENT WARD */}
        <section className="relative overflow-hidden rounded-[28px] bg-primary p-6 text-white shadow-xl">
          <div className="pointer-events-none absolute -end-14 -top-14 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] text-white/60">ورد اليوم</p>
              <p className="text-3xl font-black">
                {data.dailyPages}
                <span className="ms-1 text-xs font-bold text-white/70">صفحة</span>
              </p>
            </div>
            <p className="text-[11px] text-white/60">{formatArabicFull(data.today)}</p>
          </div>
          <div className="relative flex items-center justify-between py-6">
            <div className="text-center">
              <p className="text-[11px] text-white/60">تبدأ من</p>
              <p className="text-5xl font-black leading-none">{data.startPage}</p>
            </div>
            <ChevronLeft size={28} className="text-white/50" />
            <div className="text-center">
              <p className="text-[11px] text-white/60">حتى</p>
              <p className="text-5xl font-black leading-none">{data.endPage}</p>
            </div>
          </div>
          <div className="relative flex items-center gap-4">
            <ProgressRing
              percent={data.todayPercent}
              size={72}
              stroke={6}
              track="rgba(255,255,255,0.15)"
              bar="var(--gold)"
              label={
                <span className="text-[11px] font-black text-white">
                  {data.todayPercent}%
                </span>
              }
            />
            <p className="text-sm font-bold text-white/90">
              أنجزت {data.todayProgress} من {data.dailyPages} صفحة
              {data.todayProgress > 0 && (
                <span className="block text-[11px] font-normal text-white/60">
                  أنت الآن في صفحة {currentPage}
                </span>
              )}
            </p>
          </div>
        </section>

        {data.isDone ? (
          <div className="mt-5 animate-scale-in rounded-3xl border border-success/30 bg-success-soft p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
              <Check size={26} strokeWidth={3} />
            </div>
            <p className="mt-3 text-lg font-black">ما شاء الله 🌿 أنجزت وردك اليوم</p>
            <p className="mt-1 text-xs text-muted">
              غدًا تبدأ من صفحة {data.tomorrowStart} حتى {data.tomorrowEnd} (
              {data.tomorrowPages} صفحة)
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-5 h-12 w-full rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[0.98]"
            >
              العودة للرئيسية
            </button>
          </div>
        ) : (
          <>
            {/* CONTROLS */}
            <Card className="mt-4 p-4">
              <p className="mb-3 text-sm font-bold">تتبع تقدمك</p>
              <div className="grid grid-cols-4 gap-2">
                <ReadingBtn delta={-1} onClick={() => data.changeProgress(-1)} />
                <ReadingBtn delta={1} onClick={() => data.changeProgress(1)} />
                <ReadingBtn delta={2} onClick={() => data.changeProgress(2)} />
                <ReadingBtn delta={5} onClick={() => data.changeProgress(5)} />
              </div>
            </Card>

            {/* MANUAL */}
            <Card className="mt-3 p-4">
              <label className="mb-1.5 block text-[11px] font-bold text-muted">
                وصلت لصفحة... (سجّل تقدمك يدويًا)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={data.startPage}
                  max={data.endPage}
                  value={customPage}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    setCustomPage(e.target.value === "" ? data.startPage : raw);
                  }}
                  className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-lg font-black outline-none transition focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = Math.min(data.endPage, Math.max(data.startPage, customPage));
                    setCustomPage(value);
                    data.setProgressValue(value - data.startPage);
                  }}
                  className="h-12 shrink-0 rounded-2xl bg-primary px-4 text-sm font-black text-white transition active:scale-95"
                >
                  حفظ
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                النطاق المسموح: صفحة {data.startPage} ← {data.endPage}
              </p>
            </Card>

            {/* COMPLETE */}
            <button
              type="button"
              onClick={() => {
                data.completeToday();
                onBack();
              }}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-lg font-black text-primary-deep shadow-lg transition active:scale-[0.98]"
            >
              <Check size={20} strokeWidth={3} />
              أنهيت وردي اليوم
            </button>
            <p className="mt-3 text-center text-[11px] text-muted">
              عند الإنهاء ينتقل وردك تلقائيًا إلى الصفحة التالية غدًا
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ReadingBtn({ delta, onClick }: { delta: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 items-center justify-center gap-0.5 rounded-2xl text-sm font-black transition active:scale-95 ${
        delta > 0 ? "bg-primary text-white" : "bg-surface-2 text-muted"
      }`}
    >
      {delta > 0 ? "+" : "−"}
      {Math.abs(delta)}
    </button>
  );
}
