"use client";

import { ArrowRight, BookMarked, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { AyahActionBar, AyahMetaFooter, RelatedItem, SurahBadge, VerseText } from "@/components/quran";
import { TafsirSections } from "@/components/TafsirSections";
import { ScreenHeader } from "@/components/ui";
import type { QuranData } from "@/hooks/useQuran";
import { getGlobalId, parseAyahRef, sha256Text } from "@/lib/quran/validate";
import { DATASET_META } from "@/lib/quran/store";

const APP_NAME = "وردي";

export function AyahView({
  quran,
  ayahId,
  onBack,
  onOpenContext,
  onOpenAyah,
}: {
  quran: QuranData;
  ayahId: string;
  onBack: () => void;
  onOpenContext: (chapterId: number, highlightAyah: string) => void;
  onOpenAyah: (ayahId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const resolved = quran.getAyah(ayahId);
  const related = quran.getRelated(ayahId);
  const topics = quran.getTopics(ayahId);
  const tafsir = quran.getTafsir(ayahId);
  const bookmarked = quran.isBookmarked(ayahId);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-lg px-5 py-6">
        <ScreenHeader title="تدبر الآية" onBack={onBack} />
        <p className="mt-10 text-center text-sm text-muted">لم يتم العثور على الآية.</p>
      </div>
    );
  }

  const { verse, chapter } = resolved;
  const parsed = parseAyahRef(ayahId);

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

  const handleVerify = async () => {
    const gid = getGlobalId(parsed!.surah, parsed!.ayah, quran.dataset!.chapters);
    const hash = quran.hashes[gid! - 1];
    if (!hash) {
      window.alert("تعذر العثور على البصمة الرقمية لهذه الآية.");
      return;
    }
    const ok = (await sha256Text(verse.text)).slice(0, 24) === hash.slice(0, 24);
    window.alert(ok ? "✓ تم التحقق من الآية بالبصمة الرقمية." : "✗ تعذّر التحقق من الآية.");
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-14">
      <div className="pt-6">
        <ScreenHeader title="تدبر الآية" onBack={onBack} subtitle={ayahId} />
      </div>

      {/* VERSE CARD */}
      <div className="mt-5 rounded-[28px] border border-gold/30 bg-surface p-6 text-center shadow-md">
        <div className="mb-4 flex items-center justify-center gap-2">
          <SurahBadge name={chapter.name} count={chapter.verses.length} />
        </div>
        <VerseText text={verse.text} className="text-2xl sm:text-[26px] leading-[2.3]" />
        <p className="mt-5 text-[11px] font-bold text-muted">
          سورة {chapter.name} — الآية {verse.number}
        </p>
        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {topics.map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-primary-soft px-3 py-1 text-[10px] font-bold text-primary"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="mt-4 flex items-center gap-2">
        <AyahActionBar
          isBookmarked={bookmarked}
          onToggleBookmark={() => quran.toggleBookmark(ayahId)}
          onCopy={handleCopy}
          onShare={handleShare}
        />
        <button
          type="button"
          onClick={() => onOpenContext(chapter.id, ayahId)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-[11px] font-bold text-ink transition active:scale-95"
        >
          <BookMarked size={16} />
          سياقها
          <ArrowRight size={13} className="rotate-180" />
        </button>
      </div>

      {copied && (
        <p className="mt-2 animate-fade-up text-center text-[11px] font-bold text-success">
          تم النسخ ✓
        </p>
      )}

      <AyahMetaFooter />

      <button
        type="button"
        onClick={handleVerify}
        className="mx-auto mt-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold text-muted transition hover:text-primary"
      >
        <ShieldCheck size={12} />
        التحقق بالبصمة الرقمية
      </button>

      {/* TAFSIR */}
      {tafsir && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold-strong" />
            <h3 className="text-sm font-black">التدبر الميسر</h3>
          </div>
          <TafsirSections tafsir={tafsir} />
        </section>
      )}

      {/* RELATED */}
      {related && related.relatedAyahs.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 text-sm font-black">آيات ذات صلة</h3>
          <div className="flex flex-col gap-2">
            {related.relatedAyahs.map((r) => (
              <RelatedItem key={r.ayah} related={r} onOpen={onOpenAyah} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-[10px] text-muted">
        المصدر: {DATASET_META.source} — {DATASET_META.sourceUrl}
      </p>
    </div>
  );
}
