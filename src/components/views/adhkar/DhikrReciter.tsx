"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { Card } from "@/components/ui";
import { ProgressRing } from "@/components/ProgressRing";
import type { DhikrItem } from "@/data/adhkar";
import { loadDhikrFeedback, playCompletionFeedback, playDhikrTapFeedback } from "@/lib/dhikrFeedback";
import { useLocale } from "@/lib/locale";
import { stopAdhkarAudio } from "@/lib/adhkarAudio";
import { resolveSwipeNav } from "@/lib/swipeNav";
import { DhikrAudio } from "@/components/views/adhkar/DhikrAudio";
import { VersesMushaf } from "@/components/views/adhkar/VersesMushaf";

/**
 * The recite screen: one dhikr per page, a tasbih ring for the repetitions,
 * and explicit page navigation.
 *
 * Counting rules (pinned by scripts/test-adhkar.mjs):
 * - one tap = one repetition, so a 100x dhikr stays on screen for 100 taps;
 * - every repetition gets the soft tick;
 * - the LAST repetition gets the distinct resolution tone + the vibration,
 *   which is the only channel that still reaches a reader looking away;
 * - the session ends only after the last page's last repetition.
 */
export function DhikrReciter({
  title,
  items,
  startIndex = 0,
  countOf,
  onIncrement,
  onExit,
}: {
  title: string;
  items: DhikrItem[];
  /* Where the session opens. The caller passes the first dhikr still owed today
     so a resumed session continues instead of replaying what is already done. */
  startIndex?: number;
  /* Reads the persisted count, so the counter survives a remount and the card
     list and the reciter can never disagree about what is done. */
  countOf: (item: DhikrItem) => number;
  /* One tap = one repetition. Persistence belongs to the caller: it owns the
     counts state, so writing to the store from here left every count on screen
     stale until a remount. */
  onIncrement: (item: DhikrItem) => void;
  onExit: () => void;
}) {
  const { locale, t } = useLocale();
  const [index, setIndex] = useState(
    Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1))
  );
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [finished, setFinished] = useState(false);
  /* A short "lit" window so the Done button visibly brightens on press even
     when the tap is faster than the finger can see. */
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const pressRef = useRef<number | null>(null);

  const digits = useMemo(
    () => new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en"),
    [locale]
  );

  const item = items[index];
  const isLast = index === items.length - 1;

  const target = item?.count ?? 1;
  const current = item ? Math.min(countOf(item), target) : 0;
  const remaining = target - current;
  /* True when this dhikr is still owed. A multi-count dhikr stays on screen
     until its last repetition, so the session is a real tasbih counter instead
     of one tap satisfying 100 at once. */
  const stillOwed = remaining > 0;
  const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  /** Move to another page without counting anything. */
  const go = useCallback(
    (delta: 1 | -1) => {
      if (leaving) return;
      const next = index + delta;
      if (next < 0 || next >= items.length) return;
      /* The next page is a different dhikr: a recording from this one must not
         keep talking over it. */
      stopAdhkarAudio();
      setDirection(delta);
      setLeaving(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setLeaving(false);
        setIndex(next);
      }, 240);
    },
    [index, items.length, leaving]
  );

  const lightUp = useCallback(() => {
    setPressed(true);
    if (pressRef.current !== null) window.clearTimeout(pressRef.current);
    pressRef.current = window.setTimeout(() => {
      pressRef.current = null;
      setPressed(false);
    }, 320);
  }, []);

  const advance = useCallback(() => {
    if (leaving || !item) return;
    const prefs = loadDhikrFeedback();
    onIncrement(item);
    /* Every repetition gets a tick; the last one gets the distinct resolution
       and the vibration. Checked BEFORE the re-render, while `remaining` still
       describes the tap that just happened. */
    if (remaining <= 1) playCompletionFeedback(prefs);
    else playDhikrTapFeedback(prefs);
    /* Still repetitions left: stay on this dhikr. */
    if (remaining > 1) return;
    if (isLast) {
      stopAdhkarAudio();
      setFinished(true);
      return;
    }
    /* A little longer than a page flip so the final tone is not cut off. */
    stopAdhkarAudio();
    setDirection(1);
    setLeaving(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setLeaving(false);
      setIndex((i) => i + 1);
    }, 420);
  }, [item, isLast, leaving, onIncrement, remaining]);

  /* Clear both timers on unmount: a page-flip timer that fires after the
     reciter is gone would call setState on an unmounted tree. */
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (pressRef.current !== null) window.clearTimeout(pressRef.current);
      stopAdhkarAudio();
    },
    []
  );

  /* Swipe to change page, RTL book order: swipe left = the next page, swipe
     right = the page before. The rules (tap guard, vertical-scroll guard,
     Android gesture edges) live in the pure module so they are testable and
     the buttons below use the same `go()`. */
  const touchRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const onTouchStart = (e: ReactTouchEvent) => {
    /* A second finger must not turn the first finger's drag into a page turn. */
    if (e.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === start.id);
    if (!touch) return;
    const direction = resolveSwipeNav({
      dx: touch.clientX - start.x,
      dy: touch.clientY - start.y,
      startX: start.x,
      viewportWidth: typeof window === "undefined" ? 0 : window.innerWidth,
    });
    if (direction === "next") go(1);
    else if (direction === "prev") go(-1);
  };
  const onTouchCancel = () => {
    touchRef.current = null;
  };

  if (finished) {
    return <DoneScreen title={title} onExit={onExit} />;
  }

  /* The card must exist: `index` is clamped into range, and an empty list is
     guarded by the caller, but rendering `item.id` on undefined would throw. */
  if (!item) return null;

  /* Off-by-one: the old expression showed (n-1)/n on the final card and never
     reached 100%, while the counter beside it read n/n. */
  const pct = ((index + 1) / items.length) * 100;
  const counter = t("adhkar.progress", { current: digits.format(index + 1), total: digits.format(items.length) });

  return (
    <div className="mt-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          aria-label={t("adhkar.exit")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2 text-muted transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X size={17} />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-xs font-black text-muted">{title}</span>
        <span className="num-ltr text-xs font-black tabular-nums text-muted">{counter}</span>
      </div>

      {/* progress */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-l from-gold to-gold-strong transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Listening: a real reciter for the Quran cards, an explicitly labelled
          automatic reading for the hadith ones. No voice list, no TTS names. */}
      <DhikrAudio item={item} />

      {/* page card — one fixed frame for every dhikr, so the screen never
          changes size when the reader moves to a longer or shorter text. Long
          adhkar scroll inside the frame instead of stretching the card. */}
      <div className="relative mt-5 [perspective:1200px]">
        <div
          key={item.id}
          className={
            leaving
              ? direction === 1
                ? "animate-dhikr-leave"
                : "animate-dhikr-leave-rev"
              : "animate-dhikr-arrive"
          }
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
          /* Native vertical scrolling stays alive; the handler above only
             decides page turns. Without this the browser may claim the gesture
             for scrolling before touchend ever runs. */
          style={{ touchAction: "pan-y" }}
        >
          <Card
            className={`
              flex flex-col overflow-hidden p-0
              ${item.type === "quran" ? "border-2 border-gold/50 bg-gold-soft/40" : ""}
            `}
            style={{ height: "clamp(340px, 52dvh, 520px)" }}
          >
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-5 pt-5">
              <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-black text-gold-strong">
                {item.type === "quran" ? t("adhkar.quran") : t("adhkar.sunnah")}
              </span>
              {target > 1 && (
                <span className="num-ltr rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black tabular-nums text-muted">
                  {t("adhkar.progress", { current: digits.format(current), total: digits.format(target) })}
                </span>
              )}
              <span className="ms-auto rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-black text-gold-strong">
                {t(`adhkar.authenticity.${item.authenticity}`)}
              </span>
            </div>

            {/* Tasbih ring: the count left is the thing the reader actually
                looks at, so it gets the largest number on the page. */}
            {target > 1 && (
              <div className="mt-4 flex shrink-0 flex-col items-center">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={current}
                  aria-label={t("adhkar.remaining", { n: remaining })}
                >
                  <ProgressRing
                    percent={percent}
                    size={124}
                    stroke={9}
                    track="var(--surface-2)"
                    label={
                      <span className="flex flex-col items-center leading-none">
                        <span className="text-[34px] font-black tabular-nums text-gold-strong">
                          {digits.format(current)}
                        </span>
                      </span>
                    }
                  />
                </div>
                <p className="mt-2 text-xs font-bold text-muted">
                  {stillOwed
                    ? t("adhkar.remaining", { n: remaining })
                    : t("adhkar.done")}
                </p>
              </div>
            )}

            {/* The body scrolls inside the fixed frame; when the dhikr is short
                it is centred, so short and long adhkar share the same shape. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="flex min-h-full flex-col justify-center px-5 pb-5 pt-4">
                {item.title && (
                  <p className="mb-3 text-center text-base font-black text-gold-strong">
                    {item.title}
                  </p>
                )}

                {item.type === "quran" ? (
                  <VersesMushaf text={item.text} />
                ) : (
                  <p className="break-words whitespace-pre-line text-ink text-dhikr">
                    {item.text}
                  </p>
                )}

                {target > 1 && !stillOwed && (
                  <div className="mt-4 flex flex-col items-center">
                    <p className="text-xs font-bold text-muted">{t("adhkar.doneToday")}</p>
                  </div>
                )}

                {item.note && (
                  <p className="mt-4 break-words border-s-2 border-gold/40 ps-3 text-xs leading-6 text-muted">
                    {item.note}
                  </p>
                )}

                <p className="mt-3 break-words text-[11px] text-muted">{item.source}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <p className="mt-5 text-center text-xs font-bold text-muted">
        {stillOwed ? t("adhkar.tapHint") : isLast ? t("adhkar.finish") : t("adhkar.next")}
      </p>


      {/* Done button: muted until pressed, then it lights up. The `pressed`
          window keeps that glow visible for ~0.3s after a quick tap. */}
      <button
        type="button"
        onClick={() => {
          lightUp();
          advance();
        }}
        onPointerDown={lightUp}
        className={`
          mx-auto mt-3 flex h-14 w-44 items-center justify-center gap-2
          rounded-3xl border transition-[transform,background-color,box-shadow,color] duration-200
          active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
          ${
            pressed
              ? "border-gold bg-gold text-primary-deep shadow-[0_16px_34px_-14px_var(--gold)]"
              : "border-gold/25 bg-gold-soft/60 text-gold-strong/75 shadow-none"
          }
        `}
      >
        <Check size={18} strokeWidth={3} />
        {isLast && !stillOwed ? t("adhkar.finish") : t("adhkar.done")}
      </button>

      {/* Page controls: forward even if the dhikr is unfinished, and back to
          re-read. RTL shows "previous" on the right, like a book. */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label={t("adhkar.prev")}
          className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-2xl px-3 text-[11px] font-black transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            index > 0
              ? "bg-surface-2 text-ink hover:bg-gold/20"
              : "bg-surface-2 text-muted opacity-30"
          }`}
        >
          <ChevronRight size={17} className="ltr:rotate-180" />
          {t("adhkar.prev")}
        </button>
        <span className="num-ltr min-w-12 text-center text-xs font-black tabular-nums text-muted">
          {digits.format(index + 1)}/{digits.format(items.length)}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={isLast}
          aria-label={t("adhkar.next")}
          className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-2xl px-3 text-[11px] font-black transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            !isLast
              ? "bg-surface-2 text-ink hover:bg-gold/20"
              : "bg-surface-2 text-muted opacity-30"
          }`}
        >
          {t("adhkar.next")}
          <ChevronLeft size={17} className="ltr:rotate-180" />
        </button>
      </div>
    </div>
  );
}

function DoneScreen({ title, onExit }: { title: string; onExit: () => void }) {
  const { t } = useLocale();
  return (
    <div className="mt-10 flex flex-col items-center text-center animate-scale-in">
      <ProgressRing
        percent={100}
        size={112}
        stroke={8}
        animated
        label={
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-primary-deep shadow-[0_10px_24px_-10px_var(--gold)]">
            <Check size={34} strokeWidth={3} />
          </span>
        }
      />
      <h2 className="mt-6 text-2xl font-black text-ink">{title}</h2>
      <p className="mt-2 text-lg font-black text-gold-strong">{t("adhkar.sessionDone")}</p>
      <p className="mt-3 max-w-64 text-sm font-bold leading-7 text-muted">
        {t("adhkar.sessionDoneHint")}
      </p>
      <button
        type="button"
        onClick={onExit}
        className="mt-8 flex h-13 items-center justify-center gap-1.5 rounded-3xl bg-gold px-7 text-sm font-black text-primary-deep shadow-[0_8px_20px_-10px_var(--gold)] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronRight size={16} />
        {t("adhkar.backToList")}
      </button>
    </div>
  );
}
