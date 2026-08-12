"use client";

import { CalendarRange, Clock3, TrendingUp } from "lucide-react";
import { Card, ScreenHeader } from "@/components/ui";
import { formatArabicDate, formatArabicShort } from "@/lib/dates";
import { currentPlanIndex, planTimeline } from "@/lib/ward";
import type { WardData } from "@/hooks/useWardData";

export function PlanView({ data, onBack }: { data: WardData; onBack: () => void }) {
  const steps = planTimeline(data.settings, 12);
  const currentIndex = currentPlanIndex(data.settings, data.today);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-5">
      <ScreenHeader title="تطور وردي" subtitle="خطة نمو وردك اليومي" onBack={onBack} />

      {/* SUMMARY */}
      <Card className="mt-5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong">
            <TrendingUp size={20} />
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-muted">وردك اليوم</p>
            <p className="text-xl font-black">
              {data.dailyPages} <span className="text-xs font-bold text-muted">صفحة</span>
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-muted">الأساسي</p>
            <p className="text-xl font-black">{data.settings.baseDailyPages}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
          <div>
            <p className="text-[10px] text-muted">الزيادة</p>
            <p className="text-sm font-black">+{data.settings.increaseAmount} صفحة</p>
          </div>
          <div>
            <p className="text-[10px] text-muted">كل</p>
            <p className="text-sm font-black">{data.settings.increaseEveryDays} يوم</p>
          </div>
          <div>
            <p className="text-[10px] text-muted">البداية</p>
            <p className="text-xs font-black">{formatArabicShort(data.settings.increaseStartDate)}</p>
          </div>
        </div>
      </Card>

      {/* NEXT INCREASE */}
      {data.settings.autoIncrease ? (
        data.increaseInfo && (
          <Card className="mt-3 flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Clock3 size={19} />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted">الزيادة القادمة</p>
              <p className="text-sm font-black">{formatArabicDate(data.increaseInfo.date)}</p>
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted">
                {data.increaseInfo.daysLeft === 0 ? "اليوم!" : `بعد ${data.increaseInfo.daysLeft} يوم`}
              </p>
              <p className="text-sm font-black text-gold-strong">
                {data.increaseInfo.nextPages} صفحة
              </p>
            </div>
          </Card>
        )
      ) : (
        <Card className="mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black">الزيادة التلقائية متوقفة</p>
              <p className="mt-0.5 text-[11px] text-muted">
                وردك ثابت عند {Math.max(1, data.settings.dailyPages)} صفحة يوميًا
              </p>
            </div>
            <button
              type="button"
              onClick={data.toggleAutoIncrease}
              className="shrink-0 rounded-2xl bg-primary px-4 py-2.5 text-xs font-black text-white transition active:scale-95"
            >
              تفعيل
            </button>
          </div>
        </Card>
      )}

      {/* TIMELINE */}
      <p className="mb-2 mt-6 text-[11px] font-bold text-muted">جدول التطور</p>
      <Card className="p-2">
        {steps.map((step, idx) => {
          const isCurrent = idx === currentIndex;
          const isPast = idx < currentIndex;
          return (
            <div
              key={step.index}
              className={`flex items-center gap-3 rounded-2xl p-3 ${
                isCurrent ? "border border-gold/50 bg-gold-soft" : ""
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  isCurrent
                    ? "bg-gold text-primary-deep"
                    : isPast
                      ? "bg-primary-soft text-primary"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {step.pages}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">
                  من اليوم {step.startDay} إلى اليوم {step.endDay}
                  {isCurrent && (
                    <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-white">
                      أنت هنا
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                  <CalendarRange size={12} />
                  {formatArabicShort(step.date)}
                </p>
              </div>
              <p className="text-sm font-black">{step.pages} صفحة</p>
            </div>
          );
        })}
      </Card>

      <p className="mt-4 text-center text-[11px] text-muted">
        الورد اليومي = الأساسي {data.settings.baseDailyPages} + عدد الزيادات ×{" "}
        {data.settings.increaseAmount}
      </p>
    </div>
  );
}
