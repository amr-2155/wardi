"use client";

import { useEffect, useRef } from "react";
import { ScreenHeader } from "@/components/ui";
import { SurahBadge, VerseText } from "@/components/quran";
import type { QuranData } from "@/hooks/useQuran";

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
  const chapter = quran.dataset?.chapters.find((c) => c.id === chapterId);
  const highlightEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightEl.current) {
      highlightEl.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [chapterId, highlightAyah]);

  if (!chapter) {
    return (
      <div className="mx-auto max-w-lg px-5 py-6">
        <ScreenHeader title="المصحف" onBack={onBack} />
        <p className="mt-10 text-center text-sm text-muted">لم يتم العثور على السورة.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-14">
      <div className="pt-6">
        <ScreenHeader title="القراءة في السياق" onBack={onBack} subtitle={chapter.name} />
      </div>

      {/* CHAPTER HEADER */}
      <div className="mt-5 rounded-[28px] bg-primary p-6 text-center text-white shadow-md">
        <p className="font-quran text-3xl">{chapter.name}</p>
        <p className="mt-2 text-[11px] text-white/70">
          {chapter.transliteration} · {chapter.ayahCount} آية · {chapter.revelationPlace}
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
                  تدبر هذه الآية
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpenAyah(verseRef)}
                className="block w-full text-right"
              >
                <VerseText text={verse.text} className="text-lg sm:text-xl leading-[2.2]" />
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[10px] text-muted">
        نهاية سورة {chapter.name} — {chapter.ayahCount} آية
      </p>
    </div>
  );
}
