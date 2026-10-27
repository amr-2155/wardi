"use client";

import { BookMarked } from "lucide-react";
import { useState } from "react";
import { AyahActionBar } from "@/components/quran";
import { TadabburSection } from "@/components/views/TadabburSection";
import { Sheet } from "@/components/ui";
import { useLocale } from "@/lib/locale";
import { shareVerseCard } from "@/lib/shareCard";
import type { QuranData } from "@/hooks/useQuran";

/* Modal shell only. The reflection itself -- tafsir sections, timer, practical
   step, personal note and the journal write -- lives in TadabburSection, which
   is also what advances Quran-side progress via completeTadabbur(). Keeping the
   sheet as the entry point preserves the existing trigger and route. */
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
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const ayahId = quran.daily?.ref ?? "";
  const resolved = quran.getAyah(ayahId);

  /* A daily ayah and a loaded dataset are all that is required. This used to
     also demand a curated tafsir entry, but only 24 ayahs have one, so the
     whole sheet silently returned null for almost every day. */
  if (!open || !resolved) return null;

  const { verse, chapter } = resolved;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(verse.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareAsText = async () => {
    const text = `«${verse.text}» — ${t("ayah.shareText", {
      name: chapter.name,
      number: verse.number,
      app: t("app.name"),
    })}`;
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

  const handleShare = async () => {
    await shareVerseCard(
      {
        text: verse.text,
        reference: `${chapter.name} · ${verse.number}`,
        eyebrow: t("tadabbur.title"),
        appName: t("app.name"),
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      },
      shareAsText
    );
  };

  return (
    <Sheet open onClose={onClose} title={t("tadabbur.title")}>
      <div className="-mx-5 max-h-[72dvh] overflow-y-auto px-5 pb-2">
        <TadabburSection
          candidate={ayahId}
          candidateResolved={resolved}
          wardDay={quran.wardDay}
          quran={quran}
          showHeader={false}
        />

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
