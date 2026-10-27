"use client";

import {
  BadgeCheck,
  BedDouble,
  Check,
  ChevronLeft,
  Heart,
  Home,
  Landmark,
  MoonStar,
  Plane,
  Play,
  Search,
  Sparkles,
  Sunrise,
  Sunset,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, ScreenHeader, Toggle } from "@/components/ui";
import { ProgressRing } from "@/components/ProgressRing";
import { DHIKR_CATEGORIES, DHIKR_ITEMS, getCategoryDhikr } from "@/data/adhkar";
import type { DhikrCategoryId, DhikrItem } from "@/data/adhkar";
import { DhikrReciter } from "@/components/views/adhkar/DhikrReciter";
import {
  bumpDhikrCount,
  loadAdhkarCounts,
  loadAdhkarFavorites,
  saveAdhkarFavorites,
  type AdhkarCounts,
} from "@/lib/adhkarStore";
import { loadDhikrFeedback, playCompletionFeedback, playDhikrTapFeedback, saveDhikrFeedback, type DhikrFeedback } from "@/lib/dhikrFeedback";
import { matchesAnyArabic } from "@/lib/arabicSearch";
import { msUntilNextMidnight, todayKey } from "@/lib/dates";
import { useLocale } from "@/lib/locale";
import { isTtsSupported, loadSelectedVoiceName, speakDhikr, stopDhikrSpeech } from "@/lib/dhikrTts";

const CATEGORY_ICONS: Record<DhikrCategoryId, React.ComponentType<{ size?: number; className?: string }>> = {
  morning: Sunrise,
  evening: Sunset,
  sleep: MoonStar,
  wakeup: BedDouble,
  "after-prayer": BadgeCheck,
  home: Home,
  mosque: Landmark,
  food: UtensilsCrossed,
  travel: Plane,
  general: Sparkles,
};

/**
 * The active date key, re-armed when the day actually turns over.
 *
 * A component that captures `todayKey()` in its render body keeps the day it
 * was mounted on, and this screen can stay mounted for days: Capacitor
 * suspends the WebView instead of reloading it, so the same React tree can
 * outlive midnight. A stale key is not cosmetic â€” every increment would then
 * be written under yesterday's date and today's progress would be gone at the
 * next launch. Same lifecycle useWardData already relies on: re-arm at the
 * next local midnight, and re-check on the events that mean the page was
 * suspended rather than closed.
 */
function useTodayKey(): string {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const next = todayKey();
      setToday((prev) => (prev === next ? prev : next));
    };

    const armMidnightTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        sync();
        armMidnightTimer();
      }, msUntilNextMidnight());
    };

    const onWake = () => {
      sync();
      armMidnightTimer();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") onWake();
    };

    armMidnightTimer();
    sync();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, []);

  return today;
}

export function AdhkarView({ onBack }: { onBack: () => void }) {
  const { locale, t } = useLocale();
  const today = useTodayKey();
  const [selected, setSelected] = useState<DhikrCategoryId | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [counts, setCounts] = useState<AdhkarCounts | null>(null);
  const [loaded, setLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe load */
  useEffect(() => {
    setFavorites(loadAdhkarFavorites());
    setCounts(loadAdhkarCounts());
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    /* Before the load above has run, `favorites` is still the empty initial
       state. Saving it would briefly â€” or, if the app is killed in that
       window, permanently â€” erase the stored favorites. */
    if (!loaded) return;
    saveAdhkarFavorites(favorites);
  }, [favorites, loaded]);

  const toggleFavorite = useCallback((itemId: string) => {
    setFavorites((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }, []);

  /**
   * Counts read through the day key rather than trusting the stored one: the
   * stored date is yesterday's after a rollover, so the same expression both
   * shows today's progress and implements the daily reset.
   */
  const countOf = useCallback(
    (item: DhikrItem): number => {
      const target = item.count ?? 1;
      if (!counts || counts.date !== today) return 0;
      return Math.min(counts.items[item.id] ?? 0, target);
    },
    [counts, today]
  );

  const setDhikrCount = useCallback(
    (itemId: string, next: number) => {
      bumpDhikrCount(itemId, today, next);
      /* Re-read instead of mirroring the write: the store stays the single
         source of truth, so state can never show a count that was not
         persisted. */
      setCounts(loadAdhkarCounts());
    },
    [today]
  );

  const progress = useMemo(() => {
    let done = 0;
    for (const item of DHIKR_ITEMS) {
      if (countOf(item) >= (item.count ?? 1)) done += 1;
    }
    const total = DHIKR_ITEMS.length;
    return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  }, [countOf]);

  /* "Where you left off" = the first set that still has an unfinished dhikr.
     Listed order is the order the adhkar are meant to be read in, so the first
     gap is where the next tap belongs; no extra state to keep in sync. */
  const resumeCategory = useMemo<DhikrCategoryId | null>(() => {
    for (const category of DHIKR_CATEGORIES) {
      const items = getCategoryDhikr(category.id);
      if (items.length > 0 && items.some((item) => countOf(item) < (item.count ?? 1))) {
        return category.id;
      }
    }
    return null;
  }, [countOf]);

  const category = selected ? DHIKR_CATEGORIES.find((c) => c.id === selected) ?? null : null;
  const title = category ? (locale === "ar" ? category.titleAr : category.titleEn) : t("adhkar.title");
  const subtitle = category ? "" : t("adhkar.subtitle");

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 animate-fade-slide-up">
      <header className="animate-fade-up">
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          onBack={selected ? () => setSelected(null) : onBack}
        />
      </header>
      {selected ? (
        <AdhkarCategoryList
          key={selected}
          categoryId={selected}
          title={title}
          favorites={favorites}
          countOf={countOf}
          onSetCount={setDhikrCount}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <AdhkarHome
          favorites={favorites}
          progress={progress}
          resumeCategory={resumeCategory}
          countOf={countOf}
          onOpenCategory={(id) => setSelected(id)}
        />
      )}
    </div>
  );
}

function AdhkarHome({
  favorites,
  progress,
  resumeCategory,
  countOf,
  onOpenCategory,
}: {
  favorites: string[];
  progress: { done: number; total: number; percent: number };
  resumeCategory: DhikrCategoryId | null;
  countOf: (item: DhikrItem) => number;
  onOpenCategory: (id: DhikrCategoryId) => void;
}) {
  const { locale, t } = useLocale();
  const favoriteIds = new Set(favorites);
  const resumeTitle = resumeCategory
    ? (() => {
        const category = DHIKR_CATEGORIES.find((c) => c.id === resumeCategory);
        return category ? (locale === "ar" ? category.titleAr : category.titleEn) : "";
      })()
    : "";
  const progressLabel = t("adhkar.progress", { current: progress.done, total: progress.total });
  const percentLabel = t("ui.progress", { percent: progress.percent });

  return (
    <>
      {/* TODAY'S PROGRESS â€” the only place the daily total is visible, so it
          also carries the way back to the set that is still unfinished. */}
      <Card className="mt-5 p-5 animate-fade-up" style={{ animationDelay: "40ms" }}>
        <div className="flex items-center gap-4">
          {/* The ring keeps ProgressRing's own role; the wrapper is what carries
              the localized name, so the label is right in both languages. */}
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={percentLabel}
            className="order-2 shrink-0"
          >
            <ProgressRing
              percent={progress.percent}
              size={78}
              stroke={7}
              track="var(--surface-2)"
              label={
                <span className="text-sm font-black tabular-nums text-gold-strong">
                  {progress.percent}%
                </span>
              }
            />
          </div>
          <div className="order-1 min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-wide text-muted">
              {t("adhkar.todayProgress")}
            </p>
            <p className="num-ltr mt-1 w-fit text-xl font-black leading-tight tabular-nums text-ink">
              {progressLabel}
            </p>
            <p className="mt-1 text-[11px] font-bold text-muted">{t("adhkar.dailyReset")}</p>
          </div>
        </div>

        {resumeCategory ? (
          <button
            type="button"
            onClick={() => onOpenCategory(resumeCategory)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold px-4 text-sm font-black text-primary-deep shadow-[0_6px_18px_-8px_var(--gold)] transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Play size={16} />
            <span className="truncate">
              {t("adhkar.resume")} {t("adhkar.separator")} {resumeTitle}
            </span>
          </button>
        ) : (
          <p className="mt-4 rounded-2xl bg-success-soft py-2.5 text-center text-sm font-black text-success">
            {t("adhkar.sessionDone")}
          </p>
        )}
      </Card>

      {DHIKR_CATEGORIES.filter((c) => getCategoryDhikr(c.id).length > 0).map((category, i) => {
        const items = getCategoryDhikr(category.id);
        const favoriteCount = items.filter((item) => favoriteIds.has(item.id)).length;
        const doneCount = items.filter((item) => countOf(item) >= (item.count ?? 1)).length;
        const categoryPercent =
          items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100);
        const categoryLabel = t("adhkar.progress", { current: doneCount, total: items.length });
        const title = locale === "ar" ? category.titleAr : category.titleEn;
        const Icon = CATEGORY_ICONS[category.id];
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onOpenCategory(category.id)}
            aria-label={`${title} â€” ${categoryLabel}`}
            className="group mt-3 flex w-full items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 text-start shadow-sm transition hover:border-gold/40 hover:bg-surface-2 hover:shadow-md active:scale-[0.99] animate-fade-up focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong transition group-hover:bg-gold group-hover:text-primary-deep">
              <Icon size={22} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-black leading-tight text-ink">{title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                {items.length} {t("adhkar.items")}
                {favoriteCount > 0 ? ` ${t("adhkar.separator")} ${t("adhkar.favCount", { n: favoriteCount })}` : ""}
              </span>
              <span className="mt-2.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-gradient-to-l from-gold to-gold-strong transition-[width] duration-500 ease-out"
                    style={{ width: `${categoryPercent}%` }}
                  />
                </span>
                <span className="num-ltr shrink-0 text-[11px] font-black tabular-nums text-muted">
                  {categoryLabel}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-3 py-2 text-[11px] font-black text-gold-strong transition group-hover:bg-gold group-hover:text-primary-deep">
              {t("adhkar.open")}
              <ChevronLeft size={14} className="ltr:rotate-180" />
            </span>
          </button>
        );
      })}
    </>
  );
}

function AdhkarCategoryList({
  categoryId,
  title,
  favorites,
  countOf,
  onSetCount,
  onToggleFavorite,
}: {
  categoryId: DhikrCategoryId;
  title: string;
  favorites: string[];
  countOf: (item: DhikrItem) => number;
  onSetCount: (itemId: string, next: number) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reciting, setReciting] = useState(false);
  /* Tap-feedback prefs (tick sound + vibration). Saved on toggle; the
     reciter reads them fresh per tap, so no prop drilling is needed. */
  const [feedback, setFeedback] = useState<DhikrFeedback>(() => loadDhikrFeedback());
  const setFeedbackKey = (key: keyof DhikrFeedback, value: boolean) => {
    setFeedback((prev) => {
      const next = { ...prev, [key]: value };
      saveDhikrFeedback(next);
      return next;
    });
  };

  /* Derived, not loaded into state: the dataset is static, so an effect here
     only bought a first frame that claimed the category had zero cards. */
  const items = useMemo(() => getCategoryDhikr(categoryId), [categoryId]);

  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

  if (reciting) {
    return (
      <DhikrReciter
        title={title}
        items={items}
        /* Resume at the first dhikr still owed today; when the set is already
           complete the session simply starts over from the top. */
        startIndex={Math.max(0, items.findIndex((item) => countOf(item) < (item.count ?? 1)))}
        countOf={countOf}
        /* One tap = one repetition, matching the card path. Setting the full
           target in a single tap made a 100x dhikr complete instantly. */
        onIncrement={(item) => onSetCount(item.id, countOf(item) + 1)}
        onExit={() => setReciting(false)}
      />
    );
  }

  const visible = items.filter((item) => {
    if (favoritesOnly && !favoriteIds.has(item.id)) return false;
    return matchesAnyArabic([item.text, item.source, item.note], query);
  });

  return (
    <>
      {(categoryId === "morning" || categoryId === "evening") && (
        <button
          type="button"
          onClick={() => setReciting(true)}
          className="mt-5 flex w-full items-center gap-3.5 rounded-3xl border border-gold/40 bg-gradient-to-l from-gold-soft to-surface p-4 text-start shadow-sm transition hover:border-gold/70 hover:shadow-md active:scale-[0.99] animate-fade-up focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ animationDelay: "40ms" }}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-[0_6px_16px_-8px_var(--gold)]">
            <Sunrise size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-black leading-tight text-ink">
              {t("adhkar.startRecite")}
            </span>
            <span className="mt-1 block text-xs font-bold text-muted">
              {t("adhkar.completedCount", {
                n: items.filter((item) => countOf(item) >= (item.count ?? 1)).length,
                total: items.length,
              })}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-primary-deep">
            <ChevronLeft size={18} className="ltr:rotate-180" />
          </span>
        </button>
      )}
      <div
        className="mt-5 flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm animate-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <Search size={17} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("adhkar.searchPlaceholder")}
          className="w-full bg-transparent text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted"
          aria-label={t("adhkar.searchPlaceholder")}
        />
      </div>

      <div className="mt-3 flex gap-1.5 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            favoritesOnly
              ? "bg-gold text-primary-deep"
              : "bg-surface-2 text-ink hover:bg-gold-soft hover:text-gold-strong"
          }`}
        >
          <Heart size={13} fill={favoritesOnly ? "currentColor" : "none"} />
          {t("adhkar.favorites")}
        </button>
        <span className="rounded-full bg-gold-soft px-3 py-1.5 text-xs font-bold text-gold-strong">
          {t("adhkar.dailyReset")}
        </span>
      </div>

      {/* COMPLETION FEEDBACK â€” vibration first, because it is the channel that
          reaches you when the phone is in a pocket or held to your ear; the
          chime is optional. Both fire once, on the last repetition. */}
      <Card className="mt-3 p-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
        <p className="mb-2 text-[11px] font-bold text-muted">{t("adhkar.feedbackTitle")}</p>
        <div className="space-y-2">
          <Toggle
            checked={feedback.haptic}
            onChange={(v) => setFeedbackKey("haptic", v)}
            label={t("adhkar.completeHaptic")}
            description={t("adhkar.completeHapticDesc")}
          />
          <Toggle
            checked={feedback.sound}
            onChange={(v) => setFeedbackKey("sound", v)}
            label={t("adhkar.completeSound")}
            description={t("adhkar.completeSoundDesc")}
          />
        </div>
      </Card>

      <div className="mt-4 flex flex-col gap-3">
        {visible.length === 0 ? (
          <Card className="py-8 text-center text-muted animate-fade-up">
            <Search size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">{t("adhkar.noResults")}</p>
          </Card>
        ) : (
          visible.map((item, i) => (
            <DhikrCard
              key={item.id}
              item={item}
              current={countOf(item)}
              isFavorite={favoriteIds.has(item.id)}
              onSetCount={onSetCount}
              onToggleFavorite={onToggleFavorite}
              delay={140 + i * 40}
            />
          ))
        )}
      </div>
    </>
  );
}

function DhikrCard({
  item,
  current,
  isFavorite,
  onSetCount,
  onToggleFavorite,
  delay,
}: {
  item: DhikrItem;
  current: number;
  isFavorite: boolean;
  onSetCount: (itemId: string, next: number) => void;
  onToggleFavorite: (id: string) => void;
  delay: number;
}) {
  const { t } = useLocale();
  const target = item.count ?? 1;
  const isMulti = target > 1;
  const done = current >= target;
  const [speaking, setSpeaking] = useState(false);

  /* The counter is a toggle, like the heart beside it: back to zero once the
     dhikr is complete, so a mis-tap can be undone without reloading.

     Landing on the last repetition fires the same completion feedback the
     recite screen does â€” one pulse, one chime â€” because counting from the
     card list is the other way a dhikr gets counted, and silence in one path
     and a pulse in the other would read as a bug. */
  const toggle = () => {
    if (done) {
      onSetCount(item.id, 0);
      return;
    }
    const next = Math.min(target, current + 1);
    onSetCount(item.id, next);
    /* Per-tap feedback: on the last rep, final resolution; otherwise, light tap. */
    const prefs = loadDhikrFeedback();
    /* Per-tap feedback for every increment. */
    playDhikrTapFeedback(loadDhikrFeedback());
    /* Completion feedback on the last rep. */
    if (isMulti && next >= target) playCompletionFeedback(prefs);
  };
  const actionLabel = `${done ? t("adhkar.doneToday") : t("adhkar.markDone")} â€” ${t(
    "adhkar.progress",
    { current, total: target }
  )}`;

  return (
    <Card
      className={`overflow-hidden p-0 transition animate-fade-up ${
        done ? "border-gold/50 bg-gold-soft/25" : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-black text-gold-strong">
            {item.type === "quran" ? t("adhkar.quran") : t("adhkar.sunnah")}
          </span>
          {isMulti && (
            <span className="num-ltr rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black tabular-nums text-muted">
              {t("adhkar.multiplier")}{target}
            </span>
          )}
        </div>
        {isTtsSupported() && (
          <button
            type="button"
            onClick={() => {
              if (speaking) {
                stopDhikrSpeech();
                setSpeaking(false);
              } else {
                setSpeaking(true);
                speakDhikr(item.text, loadSelectedVoiceName(), () => setSpeaking(false));
              }
            }}
            aria-label={t("adhkar.playRecitation")}
            className="shrink-0 rounded-xl p-2 text-muted transition active:scale-90 hover:text-gold-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggleFavorite(item.id)}
          aria-label={isFavorite ? t("adhkar.unfavorite") : t("adhkar.favorite")}
          className={`shrink-0 rounded-xl p-2 transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            isFavorite ? "text-gold-strong" : "text-muted hover:text-gold-strong"
          }`}
        >
          <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      {/* The words themselves: Naskh at a readable size with the leading the
          tashkeel needs, on parchment for the standalone surah cards so they
          read like a mushaf page. */}
      <div
        className={
          item.type === "quran"
            ? "mx-3 mt-3 rounded-2xl border border-gold/40 bg-gold-soft/40 px-4 py-5 text-center"
            : "px-4 pt-4"
        }
      >
        {item.title && (
          <p className="mb-3 flex items-center justify-center gap-2 text-sm font-black text-gold-strong">
            {/* Decorative diamond (outside the Arabic block, so the W2
                no-hardcoded-Arabic gate stays green). */}
            <span aria-hidden="true">âœ¦</span>
            {item.title}
            <span aria-hidden="true">âœ¦</span>
          </p>
        )}
        <p
          className={`break-words whitespace-pre-line text-ink ${
            item.type === "quran"
              ? "text-dhikr text-dhikr-quran"
              : "text-dhikr"
          }`}
        >
          {item.text}
        </p>
      </div>

      {item.note && (
        <p className="mx-4 mt-3 break-words border-s-2 border-gold/40 ps-3 text-xs leading-6 text-muted">
          {item.note}
        </p>
      )}

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wide text-muted">{t("adhkar.source")}</p>
          <p className="mt-1 break-words text-xs font-bold leading-5 text-ink">{item.source}</p>
          <span className="mt-1.5 inline-block rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-black text-gold-strong">
            {t(`adhkar.authenticity.${item.authenticity}`)}
          </span>
        </div>
        {isMulti ? (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={done}
              aria-label={actionLabel}
              className={`flex h-16 min-w-16 flex-col items-center justify-center rounded-2xl px-3 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                done
                  ? "bg-gold text-primary-deep shadow-[0_6px_16px_-8px_var(--gold)]"
                  : "bg-gold-soft text-gold-strong hover:bg-gold hover:text-primary-deep"
              }`}
            >
              <span className="text-xl font-black leading-none tabular-nums">{current}</span>
              <span className="num-ltr mt-1 text-[10px] font-bold opacity-70 tabular-nums">
                {target}
              </span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={done}
            aria-label={actionLabel}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              done
                ? "bg-gold text-primary-deep shadow-[0_6px_16px_-8px_var(--gold)]"
                : "bg-gold-soft text-gold-strong hover:bg-gold hover:text-primary-deep"
            }`}
          >
            {done ? <Check size={22} strokeWidth={3} /> : <Check size={22} />}
          </button>
        )}
      </div>

      {/* Per-card progress: with counts up to 100 the fraction alone is hard to
          read at a glance, the fill answers "how much is left" instantly. */}
      {isMulti && (
        <div className="h-1 w-full bg-surface-2">
          <div
            className="h-full bg-gradient-to-l from-gold to-gold-strong transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, (current / target) * 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}
