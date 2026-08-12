"use client";

import { BookMarked, Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { AyahActionBar, SurahBadge, VerseText } from "@/components/quran";
import { TafsirSections } from "@/components/TafsirSections";
import { Sheet } from "@/components/ui";
import type { QuranData } from "@/hooks/useQuran";

const APP_NAME = "وردي";

export function TadabburSheet({
  open,
  onClose,
  quran,
  onOpenAyah,
}: {
  open: boolean;
  onClose: () => void;
  quran: QuranData;
  onOpenAyah: (ayahId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const ayahId = quran.daily?.ref ?? "";
  const resolved = quran.getAyah(ayahId);
  const tafsir = quran.getTafsir(ayahId);

  if (!open || !resolved || !tafsir) return null;

  const { verse, chapter } = resolved;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(verse.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleShare = async () => {
    const text = `«${verse.text}» — سورة ${chapter.name}، آية ${verse.number}. (من تطبيق ${APP_NAME})`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to copy
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDone = () => {
    quran.completeTadabbur();
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="تدبر آية اليوم">
      <div className="-mx-5 max-h-[72dvh] overflow-y-auto px-5 pb-2">
        <div className="mb-2 flex items-center justify-center gap-1 text-[11px] text-muted">
          <Sparkles size={12} className="text-gold-strong" />
          آية اليوم من وردك
        </div>

        {/* VERSE */}
        <div className="rounded-3xl border border-gold/30 bg-gold-soft/30 p-5 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <SurahBadge name={chapter.name} count={chapter.verses.length} />
          </div>
          <VerseText text={verse.text} className="text-xl sm:text-2xl leading-[2.3]" />
          <p className="mt-4 text-[11px] font-bold text-muted">
            سورة {chapter.name} — الآية {verse.number}
          </p>
        </div>

        {/* TAFSIR */}
        <div className="mt-4">
          <TafsirSections tafsir={tafsir} />
        </div>

        {/* DONE */}
        <button
          type="button"
          onClick={handleDone}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-black text-white shadow-lg transition active:scale-[0.98]"
        >
          <Check size={20} strokeWidth={3} />
          تم التدبر
        </button>

        {/* ACTIONS */}
        <div className="mt-3">
          <AyahActionBar
            isBookmarked={quran.isBookmarked(ayahId)}
            onToggleBookmark={() => quran.toggleBookmark(ayahId)}
            onCopy={handleCopy}
            onShare={handleShare}
          />
        </div>

        <button
          type="button"
          onClick={() => onOpenAyah(ayahId)}
          className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-[11px] font-bold text-ink transition active:scale-95"
        >
          <BookMarked size={15} />
          فتح صفحة الآية كاملة
        </button>

        {copied && (
          <p className="mt-2 animate-fade-up text-center text-[11px] font-bold text-success">
            تم نسخ الآية ✓
          </p>
        )}
      </div>
    </Sheet>
  );
}
