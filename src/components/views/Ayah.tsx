"use client";

import { ArrowRight, BookMarked, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { AyahActionBar, AyahMetaFooter, RelatedItem, SurahBadge, VerseText } from "@/components/quran";
import { TafsirSections } from "@/components/TafsirSections";
import { ScreenHeader } from "@/components/ui";
import { DatasetNotice } from "@/components/DatasetNotice";
import { useLocale, type Locale } from "@/lib/locale";
import type { QuranData } from "@/hooks/useQuran";
import { getGlobalId, parseAyahRef, sha256Text } from "@/lib/quran/validate";
import { DATASET_META } from "@/lib/quran/store";
import { shareVerseCard } from "@/lib/shareCard";

/** The app's own name is a brand, but it is spelled per language in the share text. */
const APP_NAME: Record<Locale, string> = { ar: "وردي", en: "Wardi" };

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
  const { t, locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const resolved = quran.getAyah(ayahId);
  const related = quran.getRelated(ayahId);
  const topics = quran.getTopics(ayahId);
  const tafsir = quran.getTafsir(ayahId);
  const bookmarked = quran.isBookmarked(ayahId);

  /* "Verse not found" would blame the reference, but a failed dataset load makes
     every reference unresolvable. Say which one it actually is. */
  if (!resolved) {
    return (
      <div className="mx-auto max-w-lg px-5 py-6">
        <ScreenHeader title={t("ayah.title")} onBack={onBack} />
        {quran.datasetStatus === "verified" ? (
          <p className="mt-10 text-center text-sm text-muted">{t("ayah.notFound")}</p>
        ) : (
          <div className="mt-6">
            <DatasetNotice quran={quran} />
          </div>
        )}
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

  /** Plain-text share. Kept as the fallback for any platform without a file
      share, which includes the in-app WebView. */
  const shareAsText = async () => {
    const text = `«${verse.text}» — ${t("ayah.shareText", {
      name: chapter.name,
      number: verse.number,
      app: APP_NAME[locale],
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
        appName: APP_NAME[locale],
        /* Read the live class rather than threading theme state through: the
           card is only built at share time, so this is always current even if
           the OS flipped the theme while this screen was open. */
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      },
      shareAsText
    );
  };

  const handleVerify = async () => {
    const gid = getGlobalId(parsed!.surah, parsed!.ayah, quran.dataset!.chapters);
    const hash = quran.hashes[gid! - 1];
    if (!hash) {
      window.alert(t("ayah.fingerprintError"));
      return;
    }
    const ok = (await sha256Text(verse.text)).slice(0, 24) === hash.slice(0, 24);
    window.alert(ok ? t("ayah.fingerprintOk") : t("ayah.fingerprintFail"));
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-14">
      <div className="pt-6">
        <ScreenHeader title={t("ayah.title")} onBack={onBack} subtitle={ayahId} />
      </div>

      {/* VERSE CARD */}
      <div className="mt-5 rounded-[28px] border border-gold/30 bg-surface p-6 text-center shadow-md">
        <div className="mb-4 flex items-center justify-center gap-2">
          <SurahBadge name={chapter.name} count={chapter.verses.length} />
        </div>
        <VerseText text={verse.text} className="text-2xl sm:text-[26px] leading-[2.3]" />
        <p className="mt-5 text-[11px] font-bold text-muted">
          {t("tadabbur.verseOf", { name: chapter.name, number: verse.number })}
        </p>
        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {topics.map((topic) => (
              <span
                key={topic.id}
                className="rounded-full bg-primary-soft px-3 py-1 text-[10px] font-bold text-primary"
              >
                {topic.name}
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
          {t("quran.context")}
          <ArrowRight size={13} className="rotate-180" />
        </button>
      </div>

      {copied && (
        <p className="mt-2 animate-fade-up text-center text-[11px] font-bold text-success">
          {t("ayah.copied")}
        </p>
      )}

      <AyahMetaFooter />

      <button
        type="button"
        onClick={handleVerify}
        className="mx-auto mt-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold text-muted transition hover:text-primary"
      >
        <ShieldCheck size={12} />
        {t("ayah.verify")}
      </button>

      {/* TAFSIR */}
      {tafsir && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold-strong" />
            <h3 className="text-sm font-black">{t("ayah.tafsirTitle")}</h3>
          </div>
          <TafsirSections tafsir={tafsir} />
        </section>
      )}

      {/* RELATED */}
      {related && related.relatedAyahs.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 text-sm font-black">{t("ayah.relatedTitle")}</h3>
          <div className="flex flex-col gap-2">
            {related.relatedAyahs.map((r) => (
              <RelatedItem key={r.ayah} related={r} onOpen={onOpenAyah} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-[10px] text-muted">
        {t("ayah.source")} {DATASET_META.source} — {DATASET_META.sourceUrl}
      </p>
    </div>
  );
}
