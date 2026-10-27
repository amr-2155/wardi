"use client";

import { useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/components/ui";
import { DatasetNotice } from "@/components/DatasetNotice";
import { SurahBadge, VerseText } from "@/components/quran";
import { AyahActionsSheet } from "@/components/views/AyahActionsSheet";
import { useLocale } from "@/lib/locale";
import type { QuranData } from "@/hooks/useQuran";

/** A press longer than this opens the actions menu (the natural gesture). */
const LONG_PRESS_MS = 420;

export function QuranReaderView({
  quran,
  chapterId,
  highlightAyah,
  onBack,
  onOpenAyah,
}: {
  quran: QuranData;
  chapterId: number;
  highlightAyah?: string;
  onBack: () => void;
  onOpenAyah: (ayahId: string) => void;
}) {
  const { t } = useLocale();
  const chapter = quran.dataset?.chapters.find((c) => c.id === chapterId);
  const highlightEl = useRef<HTMLDivElement | null>(null);
  /* Tapped verse awaiting its actions menu. The sheet (not immediate
     navigation) is the tap response, so quick actions stay one tap away
     while the full view remains one more tap inside the sheet. */
  const [menuRef, setMenuRef] = useState<string | null>(null);

  /* Press-and-hold opens the same menu. A long press on Arabic text otherwise
     ends in the platform's own text-selection/context-menu gesture, which is
     why tapping alone was not enough on device. The timer is cleared on
     release, cancel and unmount so a cancelled press cannot fire late. */
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  useEffect(() => clearHold, []);

  useEffect(() => {
    if (highlightEl.current) {
      highlightEl.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [chapterId, highlightAyah]);

  /* A failed dataset load makes every chapter unresolvable, so blaming the
     chapter reference would be wrong. Distinguish the two cases. */
  if (!chapter) {
    return (
      <div className="mx-auto max-w-lg px-5 py-6">
        <ScreenHeader title={t("mushaf.title")} onBack={onBack} />
        {quran.datasetStatus === "verified" ? (
          <p className="mt-10 text-center text-sm text-muted">{t("quran.notFound")}</p>
        ) : (
          <div className="mt-6">
            <DatasetNotice quran={quran} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-14">
      <div className="pt-6">
        <ScreenHeader title={t("quran.context")} onBack={onBack} subtitle={chapter.name} />
      </div>

      {/* CHAPTER HEADER */}
      <div className="mt-5 rounded-[28px] bg-primary p-6 text-center text-white shadow-md">
        <p className="font-quran text-3xl">{chapter.name}</p>
        <p className="mt-2 text-[11px] text-white/70">
          {chapter.transliteration} · {chapter.ayahCount} {t("library.verse")} ·{" "}
          {chapter.revelationPlace}
        </p>
      </div>

      {/* VERSES */}
      <div className="mt-5 flex flex-col gap-4">
        {chapter.verses.map((verse) => {
          const verseRef = `${chapter.id}:${verse.number}`;
          const highlighted = verseRef === highlightAyah;
          return (
            <div
              key={verse.number}
              ref={highlighted ? highlightEl : undefined}
              className={`rounded-3xl border p-5 transition ${
                highlighted
                  ? "border-gold/60 bg-gold-soft"
                  : "border-line bg-surface shadow-sm"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <SurahBadge name={chapter.name} count={verse.number} />
                <button
                  type="button"
                  onClick={() => onOpenAyah(verseRef)}
                  className="text-[10px] font-bold text-gold-strong"
                >
                  {t("tadabbur.start")}
                </button>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setMenuRef(verseRef)}
                onPointerDown={(e) => {
                  // Only a real finger/touch starts the hold; a mouse should
                  // not leave a timer pending after a plain click.
                  if (e.pointerType !== "mouse") {
                    clearHold();
                    holdTimer.current = setTimeout(() => {
                      holdTimer.current = null;
                      setMenuRef(verseRef);
                    }, LONG_PRESS_MS);
                  }
                }}
                onPointerUp={clearHold}
                onPointerCancel={clearHold}
                onPointerLeave={clearHold}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setMenuRef(verseRef);
                  }
                }}
                aria-label={t("ayahMenu.hint")}
                className="block w-full cursor-pointer text-end select-none"
              >
                <VerseText text={verse.text} className="text-lg sm:text-xl leading-[2.2]" />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[10px] text-muted">
        {t("quran.endOfSurah", { name: chapter.name, count: chapter.ayahCount })}
      </p>

      <AyahActionsSheet
        quran={quran}
        ayahRef={menuRef}
        onClose={() => setMenuRef(null)}
        onOpenAyah={onOpenAyah}
      />
    </div>
  );
}
