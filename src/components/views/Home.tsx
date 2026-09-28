"use client";

import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  Flame,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { ProgressRing } from "@/components/ProgressRing";
import { Chip, NumberField, Sheet } from "@/components/ui";
import { SurahBadge, VerseText } from "@/components/quran";
import { formatArabicFull } from "@/lib/dates";
import type { FullViewId, WardDay } from "@/lib/types";
import type { WardData } from "@/hooks/useWardData";
import type { QuranData } from "@/hooks/useQuran";
import { defaultSession, saveLastPage, saveSession } from "@/lib/quran/mushafSession";

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
  const [wardSheet, setWardSheet] = useState(false);
  const [draftFrom, setDraftFrom] = useState(data.startPage);
  const [draftCount, setDraftCount] = useState(data.dailyPages);

  const wardTotal = Math.max(1, data.settings.totalPages || 604);
  const wardFrom = Math.max(1, Math.round(draftFrom || data.startPage));
  const wardCount = Math.max(1, Math.round(draftCount || data.dailyPages));
  const wardTo = Math.min(wardTotal, wardFrom + wardCount - 1);

  const applyWard = () => {
    data.setTodayWard(wardFrom, wardCount);
    const now = new Date().toISOString();
    const seed = defaultSession({
      source: "standalone",
      startPage: wardFrom,
      endPage: wardTo,
      totalPages: wardTo - wardFrom + 1,
      lastReadPage: wardFrom,
      highestPageReached: wardFrom,
      completedPages: 0,
      completed: false,
      readAgain: false,
      resumeDismissed: false,
      autoScrollEnabled: true,
      scrollSpeed: 0.15,
      sessionStartTime: now,
      updatedAt: now,
      sessionEndTime: null,
    });
    saveSession(seed);
    saveLastPage(wardFrom);
    setWardSheet(false);
  };

  const override = data.settings.manualOverride;
  const hasOverride = override !== null && override.date === data.today;
  const planPages = data.settings.autoIncrease
    ? data.dailyPages
    : Math.max(1, data.settings.dailyPages);

  const handleOpenTadabbur = () => {
    quran.markAyahRead();
    onOpenTadabbur();
  };

  const dailyRef = quran.daily?.ref ?? "";
  const dailyResolved = quran.dailyReady && quran.daily ? quran.getAyah(dailyRef) : null;
  const wardDay = quran.wardDay;

  const todayPercent = Math.max(0, Math.min(100, data.todayPercent));
  const streakPill = (
    <span className="flex items-center gap-1 rounded-2xl bg-orange-100 px-3 py-2 text-xs font-black text-orange-600 transition active:scale-95 dark:bg-orange-500/15 dark:text-orange-400">
      <Flame size={15} />
      {data.streak}
    </span>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32">
      {/* HEADER */}
      <header className="animate-rise-in flex items-center justify-between pb-5 pt-7">
        <div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <Sparkles size={12} className="text-gold-strong" />
            أهلاً بك
          </div>
          <h1 className="mt-0.5 text-[26px] font-black tracking-tight">وردي</h1>
        </div>
        <div className="flex items-center gap-2">
          {streakPill}
          <button
            type="button"
            onClick={() => onOpen("stats")}
            aria-label="الإحصائيات"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-muted shadow-sm transition active:scale-95"
          >
            <BarChart3 size={19} />
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="animate-rise-in relative overflow-hidden rounded-[30px] bg-primary p-5 text-white shadow-[0_28px_70px_-32px_rgba(14,43,33,0.95)]">
        <div className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 animate-hero-drift rounded-full bg-gold/25 blur-3xl" />
        <div className="pointer-events-none absolute -start-16 bottom-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-bold text-white/60">ورد اليوم</p>
            <button
              type="button"
              onClick={() => setWardSheet(true)}
              aria-label="تعديل الورد"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/70 transition active:scale-95"
            >
              <SlidersHorizontal size={11} />
            </button>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black">
            الختمة {data.settings.khatmaNumber}
          </span>
        </div>

        <div className="relative mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] text-white/55">من صفحة</p>
            <p className="text-[44px] font-black leading-none">{data.startPage}</p>
            <p className="mt-1 text-[11px] text-white/55">
              إلى <b className="text-white">{data.endPage}</b>
            </p>
          </div>
          <ProgressRing
            percent={todayPercent}
            animated
            size={106}
            stroke={8}
            track="rgba(255,255,255,0.14)"
            bar="var(--gold)"
            className="shrink-0"
            label={<span className="text-lg font-black text-white">{todayPercent}%</span>}
          />
        </div>

        <div className="relative mt-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="progress-animated-bar h-full rounded-full bg-gold"
              style={{ width: `${todayPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-white/60">
            <span>
              أنجزت {data.todayProgress} من {data.dailyPages}
            </span>
            <span>متبقي {data.remainingPages}</span>
          </div>
        </div>

        <div className="relative mt-5 space-y-2">
          {data.isDone ? (
            <>
              <div className="animate-scale-in-soft flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-primary-deep">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div>
                  <p className="text-sm font-black">ما شاء الله — أنجزت وردك اليوم</p>
                  <p className="text-[11px] text-white/70">
                    غدًا تبدأ من {data.tomorrowStart} حتى {data.tomorrowEnd}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpen("mushaf")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 text-sm font-black transition active:scale-[0.98]"
              >
                <BookOpen size={17} />
                مراجعة اليوم
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpen("mushaf")}
                className="relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gold text-base font-black text-primary-deep shadow-[0_18px_44px_-18px_rgba(177,138,62,0.85)] transition active:scale-[0.98]"
              >
                <span className="pointer-events-none absolute inset-y-0 -start-24 w-40 -skew-x-12 bg-white/30 blur-[6px]" style={{ animation: "shimmer-sweep 4.2s ease-in-out infinite" }} />
                <BookOpen size={20} />
                اقرأ الآن
              </button>
              <button
                type="button"
                onClick={() => onOpen("mushaf")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 text-xs font-bold text-white/85 transition active:scale-[0.98]"
              >
                <BookMarked size={15} />
                وردي
              </button>
            </>
          )}
        </div>
      </section>

      {/* AYAH OF THE DAY — part of the ward */}
      {wardDay && dailyResolved && (
        <section className="animate-rise-in mt-4">
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
              <VerseText text={dailyResolved.verse.text} className="text-xl leading-[2.3] sm:text-2xl" />
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

      {/* TODAY — tomorrow plan + streak */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onOpen("plan")}
          className="flex flex-col items-start gap-2.5 rounded-[22px] border border-line bg-surface p-4 text-start shadow-sm transition active:scale-[0.97]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong">
            <CalendarDays size={19} />
          </span>
          <span>
            <span className="block text-[11px] text-muted">وردك القادم — غدًا</span>
            <span className="block text-lg font-black">
              {data.tomorrowStart} ← {data.tomorrowEnd}
            </span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted">
              {data.tomorrowPages} صفحة · خطة التطوير
            </span>
            {data.increaseInfo && data.increaseInfo.daysLeft === 0 && (
              <span className="mt-1.5 block">
                <Chip>يزيد اليوم</Chip>
              </span>
            )}
          </span>
          {data.settings.autoIncrease && data.increaseInfo && data.increaseInfo.daysLeft > 0 && (
            <span className="text-[10px] text-muted">
              الزيادة القادمة {formatArabicFull(data.increaseInfo.date)} —{" "}
              <b className="text-primary">{data.increaseInfo.nextPages}</b> صفحة
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpen("plan")}
          className="flex flex-col items-start justify-between gap-2.5 rounded-[22px] border border-line bg-surface p-4 text-start shadow-sm transition active:scale-[0.97]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 dark:bg-orange-500/15">
            <Flame size={20} />
          </span>
          <span>
            <span className="block text-lg font-black">
              {data.streak}
              <span className="ms-1 text-[11px] font-bold text-muted">يوم متتالي</span>
            </span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted">
              أفضل سلسلة {data.bestStreak} ·{" "}
              {data.todayReading ? (
                <span className="text-success">أنجزت اليوم</span>
              ) : (
                "باقي لليوم"
              )}
            </span>
          </span>
        </button>
      </div>

      {/* KHATMA PROGRESS */}
      <button
        type="button"
        onClick={() => onOpen("stats")}
        className="mt-3 flex w-full items-center gap-3 rounded-[22px] border border-line bg-surface p-3.5 text-start shadow-sm transition active:scale-[0.98]"
      >
        <ProgressRing
          percent={data.khatmaPercent}
          size={46}
          stroke={5}
          label={
            <span className="text-[10px] font-black text-primary">{data.khatmaPercent}%</span>
          }
        />
        <span className="flex-1">
          <span className="block text-xs font-black">تقدم الختمة {data.settings.khatmaNumber}</span>
          <span className="mt-0.5 block text-[10px] font-bold text-muted">
            من الفاتحة فصاعدًا — إنجازك المتراكم
          </span>
        </span>
        <ChevronLeft size={18} className="text-gold-strong" />
      </button>

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

      {/* BACKLOG BANNER — pages still owed from unsettled previous days */}
      {data.backlog && (
        <div className="mt-3 flex animate-fade-up items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <CalendarDays size={18} className="shrink-0 text-primary" />
          <div className="flex-1 text-[11px] font-bold">
            <span>
              متأخر <b className="text-primary">{data.backlog.missedDays.length}</b> يوم — باقي{" "}
              <b className="text-primary">{data.backlog.remainingPages}</b> صفحة
            </span>
            {data.catchUp && (
              <span className="mt-0.5 block font-normal text-muted">
                للتعويض: زيادة {data.catchUp.addPerDay} صفحة يوميًا لمدة {data.catchUp.days} يوم
              </span>
            )}
          </div>
        </div>
      )}

      {/* WARD SHEET — the specified pages only for the ward */}
      <Sheet open={wardSheet} onClose={() => setWardSheet(false)} title="الورد">
        <div className="mb-3 rounded-2xl bg-surface-2 p-3 leading-relaxed text-[11px] text-muted">
          وردك هو الصفحات المحددة فقط: من صفحة {wardFrom} إلى صفحة {wardTo} — عدد{" "}
          {wardCount} صفحة
        </div>
        <NumberField label="من صفحة" value={wardFrom} onChange={setDraftFrom} min={1} />
        <NumberField label="عدد الصفحات" value={wardCount} onChange={setDraftCount} min={1} />
        <button
          type="button"
          onClick={applyWard}
          className="mt-4 h-12 w-full rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[0.98]"
        >
          حفظ الورد
        </button>
        {!data.isDone && (
          <button
            type="button"
            onClick={() => {
              data.completeToday();
              setWardSheet(false);
            }}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-lg transition active:scale-[0.98]"
          >
            <Check size={18} strokeWidth={3} />
            أنهيت وردي اليوم
          </button>
        )}
      </Sheet>
    </div>
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