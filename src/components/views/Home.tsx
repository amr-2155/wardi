"use client";

import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Flame,
  Landmark,
  MoonStar,
  Quote,
  Shield,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProgressRing } from "@/components/ProgressRing";
import { DatasetNotice } from "@/components/DatasetNotice";
import { PrayerBar } from "@/components/PrayerBar";
import { Chip, NumberField, Sheet } from "@/components/ui";
import { SurahBadge, VerseText } from "@/components/quran";
import { formatLocaleDate, useLocale } from "@/lib/locale";
import { toArabicIndic } from "@/lib/quran/mushaf";
import { celebrateKhatma, celebrateWard } from "@/lib/haptics";
import type { CarryoverChoice, FullViewId, WardDay } from "@/lib/types";
import type { ReaderMode } from "@/components/SegmentedControl";
import type { WardData } from "@/hooks/useWardData";
import type { QuranData } from "@/hooks/useQuran";
import { defaultSession, saveLastPage, saveSession } from "@/lib/quran/mushafSession";
import { DHIKR_CATEGORIES, DHIKR_ITEMS } from "@/data/adhkar";
import { TAFSIR } from "@/data/quran";
import { dayOfYear, isLastTenNights, isRamadan, seerahNext, todayHijri, upcomingOccasions } from "@/lib/hijri";

export function HomeView({
  data,
  quran,
  onOpen,
  onOpenTadabbur,
  onOpenAyah,
}: {
  data: WardData;
  quran: QuranData;
  onOpen: (view: FullViewId, mushafMode?: ReaderMode) => void;
  onOpenTadabbur: () => void;
  onOpenAyah: (ayahId: string) => void;
}) {
  const { t, locale } = useLocale();
  /* In Arabic UI Arabic-Indic digits are the norm (the reader uses them); Latin
     digits interleaved with Arabic text look like a display bug, so user-visible
     Arabic-locale numbers go through this helper. */
  const numStr = (v: number) => (locale === "ar" ? toArabicIndic(v) : String(v));
  const [wardSheet, setWardSheet] = useState(false);
  const [carryoverReviewOpen, setCarryoverReviewOpen] = useState(false);
  /* The ward is a RANGE (from → to), matching how it is written in the mushaf:
     "from page 1 to page 25". The count is derived, never typed, so the sheet
     cannot describe a range the reader will not actually open. */
  const [draftFrom, setDraftFrom] = useState(data.startPage);
  const [draftTo, setDraftTo] = useState(data.endPage);

  const wardTotal = Math.max(1, data.settings.totalPages || 604);
  const wardFrom = Math.min(wardTotal, Math.max(1, Math.round(draftFrom || data.startPage)));
  const wardTo = Math.min(wardTotal, Math.max(wardFrom, Math.round(draftTo || data.endPage)));
  const wardCount = wardTo - wardFrom + 1;

  /* Editing one end can no longer invert the range: pushing the start past the
     end moves the end with it instead of producing an unsaveable ward. */
  const setWardStart = (value: number) => {
    const next = Math.min(wardTotal, Math.max(1, Math.round(value)));
    setDraftFrom(next);
    if (next > wardTo) setDraftTo(next);
  };

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
      recordedPages: [],
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

  /* Resolve an unfinished previous ward with one of the three explicit choices.
     "Continue" opens the oldest leftover as its own ward (its original date is
     preserved on the record); "add" raises today's target by the exact owed
     amount; "postpone" stores the debt safely with no target change. */
  const handleCarryover = (choice: CarryoverChoice) => {
    if (choice === "continue") {
      const first = data.carryover.pending[0] ?? data.carryover.postponed[0];
      if (!first) return;
      data.applyCarryover("continue", first.id);
      const nextPage = Math.min(first.endPage, first.startPage + first.pagesRead);
      if (nextPage <= first.endPage && first.remaining > 0) {
        data.setTodayWard(nextPage, first.remaining);
      }
      return;
    }
    data.applyCarryover(choice);
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

  /* Prefer the reflection ayah chosen from the pages actually read in the
     completed ward; fall back to the hash-of-day ayah before any ward finishes. */
  const dailyRef = quran.reflectionAyah || quran.daily?.ref || "";
  const dailyResolved = quran.dailyReady && quran.daily ? quran.getAyah(dailyRef) : null;
  /* Only curated entries carry a reviewed reflection question. When the
     grounded ayah has no reviewed tafsir yet, the card simply omits the
     question instead of inventing one. */
  const dailyTafsir = TAFSIR.find((entry) => entry.ref === dailyRef) ?? null;
  const wardDay = quran.wardDay;

  const todayPercent = Math.max(0, Math.min(100, data.todayPercent));

  /* Streak milestone badge: shown inside the completion card once the streak
     crosses a celebrated threshold. */
  const milestoneKey =
    data.streak >= 100
      ? "home.milestone100"
      : data.streak >= 30
        ? "home.milestone30"
        : data.streak >= 7
          ? "home.milestone7"
          : null;

  /* Hijri-driven seasonal blocks, computed once per mount. */
  const hijriNow = useMemo(() => todayHijri(), []);
  const eidAway = useMemo(
    () => upcomingOccasions(new Date(), 10).find((h) => h.occasion.id === "eid-fitr")?.daysAway ?? null,
    [],
  );

  /* Deterministic dua of the day, rotating through the adhkar dataset. The
     text itself comes from data (never a source literal), so the W2
     no-hardcoded-Arabic gate is unaffected. */
  const duaOfDay = useMemo(() => {
    if (DHIKR_ITEMS.length === 0) return null;
    return DHIKR_ITEMS[dayOfYear() % DHIKR_ITEMS.length];
  }, []);
  const duaCategory = duaOfDay
    ? DHIKR_CATEGORIES.find((c) => c.id === duaOfDay.category)
    : undefined;

  /* Next Seerah milestone from today (exact-day hit reads as "today"). */
  const seerah = useMemo(() => seerahNext(), []);
  /* Daily-content cluster (dua + seerah) starts open; collapsing keeps Home
     ward-focused without losing the content. */
  const [dailyOpen, setDailyOpen] = useState(true);
  const streakPill = (
    <span className="flex items-center gap-1 rounded-2xl bg-orange-100 px-3 py-2 text-xs font-black text-orange-600 transition active:scale-95 dark:bg-orange-500/15 dark:text-orange-400">
      <Flame size={15} />
      {numStr(data.streak)}
      {data.shieldsLeft > 0 && (
        <span className="ms-1 flex items-center gap-0.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] text-orange-600 dark:bg-black/20 dark:text-orange-300">
          <Shield size={11} />
          {numStr(data.shieldsLeft)}
        </span>
      )}
    </span>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32">
      {/* HEADER */}
      <header className="animate-rise-in flex items-center justify-between pb-5 pt-7">
        <div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <Sparkles size={12} className="text-gold-strong" />
            {t("home.welcome")}
          </div>
          <h1 className="mt-0.5 text-[26px] font-black tracking-tight">{t("nav.home")}</h1>
        </div>
        <div className="flex items-center gap-2">
          {streakPill}
          <button
            type="button"
            onClick={() => onOpen("stats")}
            aria-label={t("home.progress")}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-muted shadow-sm transition active:scale-95"
          >
            <BarChart3 size={19} />
          </button>
        </div>
      </header>

      {/* PRAYER BAR — the live next-prayer countdown and the in-app adhan /
         iqama banners. Mounted here so those alerts have somewhere to render:
         the provider produced them, but nothing displayed them. Renders nothing
         when prayer times are switched off. */}
      <PrayerBar />

      {/* HERO */}
      <section className="animate-rise-in relative overflow-hidden rounded-[30px] bg-primary p-5 text-white shadow-[0_28px_70px_-32px_rgba(14,43,33,0.95)]">
        <div className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 animate-hero-drift rounded-full bg-gold/25 blur-3xl" />
        <div className="pointer-events-none absolute -start-16 bottom-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-bold text-white/60">{t("home.ward")}</p>
            <button
              type="button"
              onClick={() => setWardSheet(true)}
              aria-label={t("home.editWard")}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/70 transition active:scale-95"
            >
              <SlidersHorizontal size={11} />
            </button>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black">
            {t("stats.khatmaN", { n: numStr(data.settings.khatmaNumber) })}
          </span>
        </div>

        <div className="relative mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] text-white/55">{t("mushaf.wardFrom")}</p>
            <p className="text-[44px] font-black leading-none">{numStr(data.startPage)}</p>
            <p className="mt-1 text-[11px] text-white/55">
              {t("home.to", { n: numStr(data.endPage) })}
            </p>
          </div>
          <ProgressRing
            percent={todayPercent}
            animated
            showDot
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
              {t("reading.progressOf", {
                done: data.todayProgress,
                total: data.todayPages,
              })}
            </span>
            <span>{t("home.remaining", { n: data.remainingPages })}</span>
          </div>
          {/* The next day's ward is already decided (it starts at the page after
              today's last one), so showing it up front answers "what comes
              tomorrow?" without waiting for today to be completed. */}
          {!data.isDone && (
            <p className="mt-2 text-[10px] font-bold text-white/45">
              {t("home.tomorrow", {
                from: data.tomorrowStart,
                to: data.tomorrowEnd,
                n: data.tomorrowPages,
              })}
            </p>
          )}
        </div>

        <div className="relative mt-5 space-y-2">
          {data.isDone ? (
            <>
              <div className="animate-scale-in-soft flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-primary-deep">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div>
                  <p className="text-sm font-black">{t("home.doneMsg")}</p>
                  <p className="text-[11px] text-white/70">
                    {t("home.tomorrow", {
                      from: data.tomorrowStart,
                      to: data.tomorrowEnd,
                      n: data.tomorrowPages,
                    })}
                  </p>
                  {milestoneKey && (
                    <p className="animate-check-pop mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/30 px-2.5 py-1 text-[10px] font-black text-white">
                      <Flame size={11} />
                      {t(milestoneKey)}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpen("mushaf", "ward")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 text-sm font-black transition active:scale-[0.98]"
              >
                <BookOpen size={17} />
                {t("home.reviewToday")}
              </button>
            </>
          ) : (
            <>
              {/* Read now opens the FULL mushaf; the ward button opens
                  ONLY today's ward pages (e.g. 25/30 pages). */}
              <button
                type="button"
                onClick={() => onOpen("mushaf", "quran")}
                className="relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gold text-base font-black text-primary-deep shadow-[0_18px_44px_-18px_rgba(177,138,62,0.85)] transition active:scale-[0.98]"
              >
                <span className="pointer-events-none absolute inset-y-0 -start-24 w-40 -skew-x-12 bg-white/30 blur-[6px]" style={{ animation: "shimmer-sweep 4.2s ease-in-out infinite" }} />
                <BookOpen size={20} />
                {t("home.readNow")}
                <ProgressRing
                  percent={todayPercent}
                  showDot
                  size={22}
                  stroke={2.5}
                  track="rgba(14,43,33,0.18)"
                  bar="var(--primary-deep)"
                  dotColor="var(--primary-deep)"
                />
              </button>
              <button
                type="button"
                onClick={() => onOpen("mushaf", "ward")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 text-xs font-bold text-white/85 transition active:scale-[0.98]"
              >
                <BookMarked size={15} />
                {t("home.wardBtn")}
                <ProgressRing
                  percent={todayPercent}
                  showDot
                  size={20}
                  stroke={2.2}
                  track="rgba(255,255,255,0.18)"
                  bar="var(--gold)"
                />
              </button>
            </>
          )}
        </div>
      </section>

      {/* RAMADAN BANNER — seasonal, renders only inside Hijri month 9. */}
      {isRamadan(hijriNow) && (
        <section className="animate-rise-in mt-4 overflow-hidden rounded-[26px] bg-gradient-to-l from-[#0e2b21] to-[#1e5240] p-4 text-white shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep">
              <MoonStar size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{t("home.ramadanTitle")}</p>
              <p className="mt-0.5 text-[11px] text-white/70">{t("home.ramadanSub")}</p>
            </div>
          </div>
          {isLastTenNights(hijriNow) && (
            <p className="mt-2.5 rounded-2xl bg-white/10 px-3 py-2 text-center text-[11px] font-black text-gold">
              {t("home.ramadanLastTen")}
            </p>
          )}
          {eidAway !== null && (
            <p className="mt-2 text-center text-[11px] font-bold text-white/70">
              {eidAway === 0 ? t("home.ramadanEidToday") : t("home.ramadanEidIn", { n: eidAway })}
            </p>
          )}
        </section>
      )}

      {/* DAILY NOURISHMENT — collapsible dua + seerah cluster so the ward
          hero stays the focus of Home. */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setDailyOpen((o) => !o)}
          aria-expanded={dailyOpen}
          className="flex w-full items-center justify-between px-1 py-1 text-[11px] font-black text-muted transition active:scale-[0.99]"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-gold-strong" />
            {t("home.dailyNourish")}
          </span>
          <ChevronDown
            size={15}
            className={`transition-transform duration-300 ${dailyOpen ? "rotate-180" : ""}`}
          />
        </button>
        {dailyOpen && (
          <div className="animate-fade-up">
      {/* DUA OF THE DAY — deterministic rotation through the adhkar set. */}
      {duaOfDay && (
        <section className="animate-rise-in mt-4 rounded-[26px] border border-gold/30 bg-gold-soft p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gold-strong">
              <Quote size={12} />
              {t("home.duaTitle")}
            </div>
            {duaCategory && (
              <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-black text-muted">
                {locale === "ar" ? duaCategory.titleAr : duaCategory.titleEn}
              </span>
            )}
          </div>
          <p className="line-clamp-4 text-sm font-bold leading-7 text-ink">{duaOfDay.text}</p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-muted">{duaOfDay.source}</span>
            <button
              type="button"
              onClick={() => onOpen("adhkar")}
              className="shrink-0 rounded-full bg-gold px-3.5 py-1.5 text-[10px] font-black text-primary-deep transition active:scale-95"
            >
              {t("home.duaOpen")}
            </button>
          </div>
        </section>
      )}

      {/* THIS DAY IN SEERAH — next Hijri milestone from the curated list. */}
      {seerah && (
        <section className="animate-rise-in mt-4 rounded-[26px] border border-line bg-surface p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <Landmark size={12} className="text-gold-strong" />
              {t("home.seerahTitle")}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                seerah.daysAway === 0 ? "bg-gold text-primary-deep" : "bg-surface-2 text-muted"
              }`}
            >
              {seerah.daysAway === 0
                ? t("occ.today")
                : seerah.daysAway === 1
                  ? t("occ.tomorrow")
                  : t("occ.daysAway", { n: seerah.daysAway })}
            </span>
          </div>
          <p className="text-sm font-black text-ink">{t(seerah.event.titleKey)}</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">{t(seerah.event.descKey)}</p>
        </section>
      )}
          </div>
        )}
      </div>

      {/* AYAH OF THE DAY — part of the ward. When the Quran text is missing
          the card would just vanish, so the reason is stated instead. */}
      {quran.datasetStatus !== "verified" && <DatasetNotice quran={quran} />}
      {wardDay && dailyResolved && (
        <section className="animate-rise-in mt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <Sparkles size={12} className="text-gold-strong" />
              {t("library.dailyVerse")}
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
                {t("tadabbur.verseOf", {
                  name: dailyResolved.chapter.name,
                  number: dailyResolved.verse.number,
                })}
              </p>
              {dailyTafsir?.reflection && (
                <p className="mx-auto mt-3 max-w-[36ch] text-xs font-bold leading-7 text-primary">
                  {dailyTafsir.reflection}
                </p>
              )}
            </div>

            {wardDay.deferred && !wardDay.tadabburDone && (
              <div className="mt-4 animate-fade-up rounded-2xl border border-gold/40 bg-gold-soft/50 px-3 py-2 text-center text-[10px] font-bold text-gold-strong">
                {t("tadabbur.deferred")}
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
                    {t("home.reflectAgain")}
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    {t("tadabbur.reflectCta")}
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
                  {t("tadabbur.defer")}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => dailyRef && onOpenAyah(dailyRef)}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-[11px] font-bold text-ink ring-1 ring-line transition active:scale-95"
            >
              <BookOpen size={15} />
              {t("tadabbur.fullTafsir")}
            </button>
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
            <span className="block text-[11px] text-muted">{t("home.nextTomorrow")}</span>
            <span className="block text-lg font-black">
              {data.tomorrowStart} ← {data.tomorrowEnd}
            </span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted">
              {t("home.tomorrowPlan", { n: data.tomorrowPages })}
            </span>
            {data.increaseInfo && data.increaseInfo.daysLeft === 0 && (
              <span className="mt-1.5 block">
                <Chip>{t("home.increasesToday")}</Chip>
              </span>
            )}
          </span>
          {data.settings.autoIncrease && data.increaseInfo && data.increaseInfo.daysLeft > 0 && (
            <span className="text-[10px] text-muted">
              {t("home.nextIncreaseLine", {
                date: formatLocaleDate(locale, data.increaseInfo.date),
                n: data.increaseInfo.nextPages,
              })}
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
              {numStr(data.streak)}
              <span className="ms-1 text-[11px] font-bold text-muted">{t("home.dayStreak")}</span>
            </span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted">
              {t("home.bestStreak", { n: data.bestStreak })} ·{" "}
              {data.todayReading ? (
                <span className="text-success">{t("home.doneTodayShort")}</span>
              ) : (
                t("home.leftToday")
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
            <span className="text-[10px] font-black text-primary">{numStr(data.khatmaPercent)}%</span>
          }
        />
        <span className="flex-1">
          <span className="block text-xs font-black">
            {t("home.khatmaProgress", { n: numStr(data.settings.khatmaNumber) })}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold text-muted">
            {t("home.khatmaSub")}
          </span>
        </span>
        <ChevronLeft size={18} className="text-gold-strong" />
      </button>

      {/* MANUAL OVERRIDE BANNER */}
      {hasOverride && (
        <div className="mt-3 flex animate-fade-up items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft p-3">
          <SlidersHorizontal size={18} className="shrink-0 text-gold-strong" />
          <div className="flex-1 text-[11px] font-bold">
            {t("home.overrideTo", { n: override?.pages })}
            <span className="mt-0.5 block font-normal text-muted">
              {t("home.overrideBack", { n: planPages })}
            </span>
          </div>
          <button
            type="button"
            onClick={data.clearManualOverride}
            className="rounded-full bg-surface px-3 py-1.5 text-[10px] font-bold text-primary shadow-sm"
          >
            {t("ui.cancel")}
          </button>
        </div>
      )}

      {/* CARRYOVER CARD — an unfinished previous ward needs an EXPLICIT choice.
          Nothing is merged, deleted or double-counted until the user decides. */}
      {data.carryover.all.length > 0 && (
        <div className="mt-3 animate-fade-up rounded-[22px] border border-primary/30 bg-primary/5 p-3.5">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="shrink-0 text-primary" />
            <span className="text-xs font-black">{t("home.carryoverTitle")}</span>
          </div>

          {data.carryover.pending.length > 0 && (
            <>
              <p className="mt-2 text-[11px] font-bold leading-relaxed">
                {t("home.carryoverIntro", {
                  n: data.carryover.pending.length,
                  m: data.carryover.pendingRemaining,
                })}
              </p>
              <div className="mt-2 space-y-1">
                {data.carryover.pending.slice(0, 4).map((w) => (
                  <p key={w.id} className="text-[10px] leading-relaxed text-muted">
                    {t("home.carryoverDay", {
                      date: formatLocaleDate(locale, w.date),
                      read: w.pagesRead,
                      planned: w.plannedPages,
                      remaining: w.remaining,
                    })}
                  </p>
                ))}
                {data.carryover.pending.length > 4 && (
                  <p className="text-[10px] text-muted">+{data.carryover.pending.length - 4}</p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => handleCarryover("continue")}
                  className="w-full rounded-2xl bg-primary px-3 py-2.5 text-start transition active:scale-[0.98]"
                >
                  <span className="block text-xs font-black text-white">
                    {t("home.carryoverContinue")}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold text-white/80">
                    {t("home.carryoverContinueHint")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCarryover("add")}
                  className="w-full rounded-2xl bg-gold px-3 py-2.5 text-start transition active:scale-[0.98]"
                >
                  <span className="block text-xs font-black text-primary-deep">
                    {t("home.carryoverAdd")}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold text-primary-deep/80">
                    {t("home.carryoverAddHint", {
                      base: data.dailyPages,
                      extra: data.carryover.pendingRemaining,
                      total: data.dailyPages + data.carryover.pendingRemaining,
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCarryover("postpone")}
                  className="w-full rounded-2xl bg-surface px-3 py-2.5 text-start shadow-sm transition active:scale-[0.98]"
                >
                  <span className="block text-xs font-black">{t("home.carryoverPostpone")}</span>
                  <span className="mt-0.5 block text-[10px] font-bold text-muted">
                    {t("home.carryoverPostponeHint")}
                  </span>
                </button>
              </div>

              <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-[10px] leading-relaxed text-muted">
                {t("home.carryoverCharity")}
              </p>
            </>
          )}

          {(data.carryover.postponed.length > 0 || data.carryover.resolved.length > 0) && (
            <div className="mt-3 border-t border-line pt-2">
              <button
                type="button"
                onClick={() => setCarryoverReviewOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] font-black text-muted"
              >
                <span>{t("home.carryoverReview")}</span>
                <ChevronDown
                  size={14}
                  className={`transition ${carryoverReviewOpen ? "rotate-180" : ""}`}
                />
              </button>
              {carryoverReviewOpen && (
                <div className="mt-2 space-y-1">
                  {[...data.carryover.postponed, ...data.carryover.resolved].map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2 py-1.5 text-[10px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {formatLocaleDate(locale, w.date)} — {w.remaining}
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-bold text-primary">
                        {w.decision === "postpone"
                          ? t("home.carryoverPostponedTag")
                          : t("home.carryoverResolvedTag")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* WARD SHEET — pick the daily ward as a range (from → to). The size is
          derived, and the same block advances automatically every day. */}
      <Sheet open={wardSheet} onClose={() => setWardSheet(false)} title={t("home.ward")}>
        <div className="mb-3 rounded-2xl bg-surface-2 p-3 leading-relaxed text-[11px] text-muted">
          {t("home.wardExplain", {
            from: wardFrom,
            to: wardTo,
            count: wardCount,
          })}
        </div>
        <NumberField
          label={t("mushaf.wardFrom")}
          value={wardFrom}
          onChange={setWardStart}
          min={1}
          max={wardTotal}
        />
        <NumberField
          label={t("home.wardTo")}
          value={wardTo}
          onChange={setDraftTo}
          min={1}
          max={wardTotal}
        />
        <p className="mt-1 text-center text-[11px] font-bold text-muted">
          {t("home.pageCount")}: {wardCount}
        </p>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-muted">
          {t("home.wardAuto")}
        </p>
        <button
          type="button"
          onClick={applyWard}
          className="mt-4 h-12 w-full rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[0.98]"
        >
          {t("home.saveWard")}
        </button>
        {!data.isDone && (
          <button
            type="button"
            onClick={() => {
              const closedKhatma = data.endPage >= data.settings.totalPages;
              data.completeToday();
              if (closedKhatma) celebrateKhatma();
              else celebrateWard();
              setWardSheet(false);
            }}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-lg transition active:scale-[0.98]"
          >
            <Check size={18} strokeWidth={3} />
            {t("home.finishToday")}
          </button>
        )}
      </Sheet>
    </div>
  );
}

function WardSteps({ wardDay }: { wardDay: WardDay }) {
  const { t } = useLocale();
  const steps = [
    { label: t("home.stepRead"), done: wardDay.read },
    { label: t("home.stepReflect"), done: wardDay.tadabburDone },
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