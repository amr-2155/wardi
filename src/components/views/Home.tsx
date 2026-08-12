"use client";

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Flame,
  Minus,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ProgressRing } from "@/components/ProgressRing";
import { Card, Chip, NumberField, Sheet } from "@/components/ui";
import { SurahBadge, VerseText } from "@/components/quran";
import { formatArabicShort, formatArabicFull } from "@/lib/dates";
import type { FullViewId, WardDay } from "@/lib/types";
import type { WardData } from "@/hooks/useWardData";
import type { QuranData } from "@/hooks/useQuran";

export function HomeView({
  data,
  quran,
  onOpen,
  onOpenTadabbur,
}: {
  data: WardData;
  quran: QuranData;
  onOpen: (view: FullViewId) => void;
  onOpenTadabbur: () => void;
}) {
  const [progressSheet, setProgressSheet] = useState(false);
  const [overrideSheet, setOverrideSheet] = useState(false);
  const [draftProgress, setDraftProgress] = useState(data.todayProgress || data.dailyPages);
  const [draftOverride, setDraftOverride] = useState(
    data.settings.manualOverride?.pages ?? data.dailyPages
  );

  const override = data.settings.manualOverride;
  const hasOverride = override !== null && override.date === data.today;
  const planPages = data.settings.autoIncrease
    ? data.dailyPages
    : Math.max(1, data.settings.dailyPages);
  const khatmaRemaining = data.settings.totalPages - data.startPage + 1;

  const handleOpenTadabbur = () => {
    quran.markAyahRead();
    onOpenTadabbur();
  };

  const dailyRef = quran.daily?.ref ?? "";
  const dailyResolved = quran.dailyReady && quran.daily ? quran.getAyah(dailyRef) : null;
  const wardDay = quran.wardDay;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32">
      {/* HEADER */}
      <header className="flex items-center justify-between pb-4 pt-6">
        <div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <Sparkles size={12} className="text-gold-strong" />
            أهلاً بك
          </div>
          <h1 className="text-2xl font-black">وردي</h1>
        </div>
        <button
          type="button"
          onClick={() => onOpen("stats")}
          aria-label="الإحصائيات"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-muted shadow-sm transition active:scale-95"
        >
          <BarChart3 size={20} />
        </button>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden rounded-[28px] bg-primary p-5 text-white shadow-xl">
        <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute -start-10 bottom-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[11px] text-white/60">ورد اليوم</p>
            <p className="text-4xl font-black leading-none">
              {data.dailyPages}
              <span className="ms-1 text-sm font-bold text-white/70">صفحة</span>
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-white/60">الختمة الحالية</p>
            <p className="text-lg font-black">{data.settings.khatmaNumber}</p>
          </div>
        </div>

        <div className="relative flex items-center gap-4 py-5">
          <ProgressRing
            percent={data.todayPercent}
            size={96}
            stroke={7}
            track="rgba(255,255,255,0.15)"
            bar="var(--gold)"
            className="shrink-0"
            label={
              <span className="text-sm font-black text-white">{data.todayPercent}%</span>
            }
          />
          <div>
            <p className="text-[11px] text-white/60">ابدأ من صفحة</p>
            <p className="text-5xl font-black leading-none">{data.startPage}</p>
            <p className="mt-1 text-[11px] text-white/60">
              حتى صفحة <b className="text-white">{data.endPage}</b>
            </p>
          </div>
        </div>

        {data.isDone ? (
          <div className="relative flex animate-scale-in items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-primary-deep">
              <Check size={20} strokeWidth={3} />
            </div>
            <div>
              <p className="text-sm font-black">ما شاء الله 🌿 أنجزت وردك اليوم</p>
              <p className="text-[11px] text-white/70">
                غدًا تبدأ من صفحة {data.tomorrowStart} حتى {data.tomorrowEnd}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative text-[11px] text-white/70">
            أنجزت <b className="text-white">{data.todayProgress}</b> من {data.dailyPages} صفحة —
            متبقي <b className="text-white">{data.remainingPages}</b>
          </div>
        )}
      </section>

      {/* AYAH OF THE DAY — part of the ward */}
      {wardDay && dailyResolved && (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <Sparkles size={12} className="text-gold-strong" />
              آية اليوم — من وردك
            </div>
            <WardSteps wardDay={wardDay} />
          </div>

          <div className="rounded-[28px] border border-gold/40 bg-surface p-5 shadow-sm">
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <SurahBadge name={dailyResolved.chapter.name} count={dailyResolved.chapter.verses.length} />
              </div>
              <VerseText text={dailyResolved.verse.text} className="text-xl sm:text-2xl leading-[2.3]" />
              <p className="mt-3 text-[11px] font-bold text-muted">
                سورة {dailyResolved.chapter.name} — الآية {dailyResolved.verse.number}
              </p>
            </div>

            {wardDay.deferred && !wardDay.tadabburDone && (
              <div className="mt-4 animate-fade-up rounded-2xl border border-gold/40 bg-gold-soft/50 px-3 py-2 text-center text-[10px] font-bold text-gold-strong">
                سجّلناها لك — ارجع إليها في أي وقت من هنا.
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenTadabbur}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-2xl text-xs font-black transition active:scale-95 ${
                  wardDay.tadabburDone
                    ? "bg-gold-soft text-gold-strong"
                    : "bg-primary text-white shadow-md"
                }`}
              >
                {wardDay.tadabburDone ? (
                  <>
                    <Check size={16} strokeWidth={3} />
                    أُنجز — أعد التدبر
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    تدبر الآن
                  </>
                )}
              </button>
              {!wardDay.tadabburDone && (
                <button
                  type="button"
                  onClick={quran.deferTadabbur}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-xs font-bold text-ink transition active:scale-95"
                >
                  <Clock3 size={15} />
                  سأعود إليها لاحقًا
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* QUICK ACTIONS */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onOpen("reading")}
          className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-primary text-white shadow-md transition active:scale-95"
        >
          <BookOpen size={20} />
          <span className="text-[11px] font-bold">اقرأ الآن</span>
        </button>
        <QuickAction
          icon={<TrendingUp size={20} />}
          label="تطور وردي"
          onClick={() => onOpen("plan")}
        />
      </div>

      {/* MANUAL OVERRIDE BANNER */}
      {hasOverride && (
        <div className="mt-3 flex animate-fade-up items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft p-3">
          <SlidersHorizontal size={18} className="shrink-0 text-gold-strong" />
          <div className="flex-1 text-[11px] font-bold">
            ورد اليوم معدل إلى <b className="text-primary">{override?.pages}</b> صفحة
            <span className="mt-0.5 block font-normal text-muted">
              بدل {planPages} صفحة — غدًا يعود للخطة تلقائيًا
            </span>
          </div>
          <button
            type="button"
            onClick={data.clearManualOverride}
            className="rounded-full bg-surface px-3 py-1.5 text-[10px] font-bold text-primary shadow-sm"
          >
            إلغاء
          </button>
        </div>
      )}

      {/* PROGRESS CONTROL */}
      <Card className="mt-3 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">متابعة الورد</p>
            <p className="mt-0.5 text-[11px] text-muted">
              الصفحة الحالية: {data.startPage + data.todayProgress}
            </p>
          </div>
          <p className="text-[11px] text-muted">
            متبقي <b className="text-primary">{data.remainingPages}</b>
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <ProgressBtn delta={-1} onClick={() => data.changeProgress(-1)} disabled={data.isDone} />
          <ProgressBtn delta={1} onClick={() => data.changeProgress(1)} disabled={data.isDone} />
          <ProgressBtn delta={2} onClick={() => data.changeProgress(2)} disabled={data.isDone} />
          <ProgressBtn delta={5} onClick={() => data.changeProgress(5)} disabled={data.isDone} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDraftProgress(data.todayProgress || data.dailyPages);
              setProgressSheet(true);
            }}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-xs font-bold transition active:scale-95"
          >
            <SlidersHorizontal size={15} /> تحديد تقدم مخصص
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftOverride(override?.pages ?? data.dailyPages);
              setOverrideSheet(true);
            }}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gold-soft text-xs font-bold text-gold-strong transition active:scale-95"
          >
            تعديل ورد اليوم
          </button>
        </div>
      </Card>

      {/* COMPLETE */}
      {!data.isDone && (
        <button
          type="button"
          onClick={data.completeToday}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-lg font-black text-primary-deep shadow-lg transition active:scale-[0.98]"
        >
          <Check size={20} strokeWidth={3} />
          أنهيت وردي اليوم
        </button>
      )}

      {/* NEXT DAY */}
      <Card className="mt-3 flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong">
          <CalendarDays size={19} />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-muted">وردك القادم — غدًا</p>
          <p className="text-sm font-black">
            {data.tomorrowStart} ← {data.tomorrowEnd}
            <span className="ms-1 text-[10px] font-bold text-muted">
              ({data.tomorrowPages} صفحة)
            </span>
          </p>
          {data.settings.autoIncrease && data.increaseInfo && data.increaseInfo.daysLeft > 0 && (
            <p className="mt-1 text-[10px] text-muted">
              الزيادة القادمة {formatArabicShort(data.increaseInfo.date)} (بعد{" "}
              {data.increaseInfo.daysLeft} يوم) ←{" "}
              <b className="text-primary">{data.increaseInfo.nextPages}</b> صفحة
            </p>
          )}
        </div>
        {data.increaseInfo && data.increaseInfo.daysLeft === 0 && (
          <Chip>يزيد اليوم</Chip>
        )}
      </Card>

      {/* STREAK */}
      <Card className="mt-3 flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 dark:bg-orange-500/15">
          <Flame size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black">{data.streak} يوم متتالي</p>
          <p className="text-[11px] text-muted">
            حافظ على وردك اليومي — أفضل سلسلة {data.bestStreak}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-success">
          <span className="flex h-2 w-2 rounded-full bg-success" />
          {data.todayReading ? "أنجزت اليوم ✓" : "باقي لليوم"}
        </div>
      </Card>

      {/* KHATMA */}
      <Card className="mt-3 flex items-center gap-4 p-4">
        <ProgressRing
          percent={data.khatmaPercent}
          size={60}
          stroke={5}
          label={
            <span className="text-[11px] font-black text-primary">
              {data.khatmaPercent}%
            </span>
          }
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <Target size={15} className="text-gold-strong" />
            <p className="text-sm font-black">تقدم الختمة {data.settings.khatmaNumber}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            صفحة {data.startPage} من {data.settings.totalPages} — متبقي {khatmaRemaining} صفحة
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen("stats")}
          className="text-[10px] font-bold text-gold-strong"
        >
          التفاصيل
        </button>
      </Card>

      {/* PROGRESS SHEET */}
      <Sheet open={progressSheet} onClose={() => setProgressSheet(false)} title="تحديد تقدم اليوم">
        <NumberField
          label="كم صفحة أنجزت من ورد اليوم؟"
          value={draftProgress}
          onChange={setDraftProgress}
        />
        <button
          type="button"
          onClick={() => {
            data.setProgressValue(draftProgress);
            setProgressSheet(false);
          }}
          className="mt-4 h-12 w-full rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[0.98]"
        >
          حفظ التقدم
        </button>
        <p className="mt-3 text-center text-[11px] text-muted">
          تقدمك لليوم: {data.todayProgress} من {data.dailyPages} صفحة
        </p>
      </Sheet>

      {/* OVERRIDE SHEET */}
      <Sheet open={overrideSheet} onClose={() => setOverrideSheet(false)} title="تعديل ورد اليوم">
        <div className="mb-3 rounded-2xl bg-surface-2 p-3 text-[11px] text-muted">
          خطة اليوم الأصلي: {planPages} صفحة —{" "}
          {data.settings.autoIncrease ? "حسب جدول التطوير" : "وردك الثابت"}. الغد يعود تلقائيًا للخطة.
        </div>
        <NumberField
          label="عدد صفحات ورد اليوم (تعديل ليوم واحد)"
          value={draftOverride}
          onChange={setDraftOverride}
        />
        <button
          type="button"
          onClick={() => {
            data.setManualOverride(draftOverride);
            setOverrideSheet(false);
          }}
          className="mt-4 h-12 w-full rounded-2xl bg-gold text-sm font-black text-primary-deep transition active:scale-[0.98]"
        >
          تطبيق تعديل اليوم
        </button>
        <p className="mt-3 text-center text-[11px] text-muted">{formatArabicFull(data.today)}</p>
      </Sheet>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface text-ink shadow-sm transition active:scale-95"
    >
      <span className="text-gold-strong">{icon}</span>
      <span className="text-[11px] font-bold">{label}</span>
    </button>
  );
}

function ProgressBtn({  delta,
  onClick,
  disabled,
}: {
  delta: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 items-center justify-center gap-0.5 rounded-2xl text-sm font-black transition active:scale-95 disabled:opacity-40 ${
        delta > 0 ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"
      }`}
    >
      {delta > 0 ? <Plus size={15} /> : <Minus size={15} />}
      <span>{Math.abs(delta)}</span>
    </button>
  );
}

function WardSteps({ wardDay }: { wardDay: WardDay }) {
  const steps = [
    { label: "قراءة", done: wardDay.read },
    { label: "تدبر", done: wardDay.tadabburDone },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1">
          {i > 0 && (
            <span className={`h-px w-2.5 ${steps[i - 1].done && step.done ? "bg-success" : "bg-line"}`} />
          )}
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              step.done ? "bg-success/15 text-success" : "bg-surface-2 text-muted"
            }`}
          >
            {step.done && <Check size={9} strokeWidth={3} />}
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
