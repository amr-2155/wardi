"use client";

import { BookOpen, CircleAlert, Pause, Play } from "lucide-react";
import { useState } from "react";
import { ReciterSheet } from "@/components/audio/ReciterSheet";
import { useAudioPlayer } from "@/components/providers/AudioProvider";
import { AyahActionBar, RelatedItem, SurahBadge, VerseText } from "@/components/quran";
import { TafsirSections } from "@/components/TafsirSections";
import { Sheet } from "@/components/ui";
import { useLocale } from "@/lib/locale";
import type { QuranData } from "@/hooks/useQuran";
import { shareVerseCard } from "@/lib/shareCard";

/**
 * Bottom-sheet actions menu for a tapped ayah (text-based readers only).
 *
 * Why not the mushaf pages: those render as raster images with no ayah
 * coordinates, so a tap there cannot identify an ayah — and MushafReader is
 * hash-frozen anyway. Every action here reuses an existing engine:
 * - listen: AudioProvider.loadSurah(chapter, ayah) + play (continues the surah)
 * - bookmark/copy/share: the same handlers as AyahView
 * - tafsir: curated entries only (24 ayahs), honest empty state otherwise
 * - similar ayahs: verified relations only, hidden when absent
 * - translation: NO dataset backing exists, so the row is deliberately absent
 * - per-ayah notes: no system exists; nothing duplicated, daily tadabbur untouched
 */
export function AyahActionsSheet({
  quran,
  ayahRef,
  onClose,
  onOpenAyah,
}: {
  quran: QuranData;
  ayahRef: string | null;
  onClose: () => void;
  onOpenAyah: (ayahId: string) => void;
}) {
  const { t } = useLocale();
  const audio = useAudioPlayer();
  const [reciterOpen, setReciterOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const resolved = ayahRef ? quran.getAyah(ayahRef) : null;

  const handleListen = async () => {
    if (!resolved || starting) return;
    if (!audio.currentReciter) {
      setReciterOpen(true);
      return;
    }
    setStarting(true);
    try {
      await audio.actions.loadSurah(resolved.chapter.id, resolved.verse.number);
      audio.actions.play();
    } finally {
      setStarting(false);
    }
  };

  const handleCopy = async () => {
    if (!resolved) return;
    await navigator.clipboard.writeText(resolved.verse.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareAsText = async () => {
    if (!resolved) return;
    const text = `«${resolved.verse.text}» — ${t("ayah.shareText", {
      name: resolved.chapter.name,
      number: resolved.verse.number,
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
    if (!resolved) return;
    await shareVerseCard(
      {
        text: resolved.verse.text,
        reference: `${resolved.chapter.name} · ${resolved.verse.number}`,
        appName: t("app.name"),
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      },
      shareAsText
    );
  };

  if (!ayahRef) return null;

  const title = resolved
    ? `${resolved.chapter.name} · ${resolved.verse.number}`
    : ayahRef;
  const tafsir = ayahRef ? quran.getTafsir(ayahRef) : null;
  const related = ayahRef ? quran.getRelated(ayahRef) : null;
  const bookmarked = ayahRef ? quran.isBookmarked(ayahRef) : false;

  const playingThis =
    !!resolved &&
    audio.currentTrack?.surah === resolved.chapter.id &&
    audio.currentTrack?.ayah === resolved.verse.number &&
    audio.player.isPlaying;
  const busy = starting || audio.player.isLoading;

  return (
    <>
      <Sheet open onClose={onClose} title={title}>
        {resolved ? (
          <>
            {/* VERSE PREVIEW */}
            <div className="mb-3 flex items-center gap-2">
              <SurahBadge name={resolved.chapter.name} count={resolved.verse.number} />
            </div>
            <VerseText text={resolved.verse.text} className="text-lg leading-[2.2]" />

            {/* LISTEN */}
            <div className="mt-4">
              {playingThis ? (
                <button
                  type="button"
                  onClick={() => audio.actions.pause()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep transition active:scale-[0.98]"
                >
                  <Pause size={17} />
                  {t("audio.pause")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleListen()}
                  disabled={busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep transition active:scale-[0.98] disabled:opacity-50"
                >
                  <Play size={17} />
                  {busy ? t("mushaf.listenLoading") : t("audio.play")}
                </button>
              )}
              {!audio.currentReciter && (
                <p className="mt-2 text-center text-[11px] font-bold text-muted">
                  {t("ayahMenu.pickReciterFirst")}
                </p>
              )}
              {audio.error && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-center">
                  <CircleAlert size={13} className="shrink-0 text-danger" />
                  <p className="text-[11px] font-bold text-danger">
                    {t("audio.error")}: {audio.error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleListen()}
                    className="text-[11px] font-black text-primary underline"
                  >
                    {t("audio.retry")}
                  </button>
                </div>
              )}
            </div>

            {/* BOOKMARK / COPY / SHARE */}
            <div className="mt-3">
              <AyahActionBar
                isBookmarked={bookmarked}
                onToggleBookmark={() => quran.toggleBookmark(ayahRef)}
                onCopy={() => void handleCopy()}
                onShare={() => void handleShare()}
              />
              {copied && (
                <p className="mt-2 animate-fade-up text-center text-[11px] font-bold text-success">
                  {t("ayah.copied")}
                </p>
              )}
            </div>

            {/* FULL VIEW */}
            <button
              type="button"
              onClick={() => onOpenAyah(ayahRef)}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 text-xs font-bold text-ink transition active:scale-[0.98]"
            >
              <BookOpen size={15} />
              {t("ayahMenu.openDetails")}
            </button>

            {/* TAFSIR */}
            <section className="mt-5">
              <h4 className="mb-2 text-sm font-black">{t("ayah.tafsirTitle")}</h4>
              {tafsir ? (
                <TafsirSections tafsir={tafsir} />
              ) : (
                <div className="rounded-2xl border border-line bg-surface-2 p-4">
                  <p className="text-xs font-black text-ink">{t("tadabbur.noTafsirTitle")}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    {t("tadabbur.noTafsirHint")}
                  </p>
                </div>
              )}
            </section>

            {/* SIMILAR (verified relations only) */}
            {related && related.relatedAyahs.length > 0 && (
              <section className="mt-5">
                <h4 className="mb-2 text-sm font-black">{t("ayah.relatedTitle")}</h4>
                <div className="flex flex-col gap-2">
                  {related.relatedAyahs.map((r) => (
                    <RelatedItem key={r.ayah} related={r} onOpen={onOpenAyah} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted">{t("ayah.notFound")}</p>
        )}
      </Sheet>
      <ReciterSheet open={reciterOpen} onClose={() => setReciterOpen(false)} />
    </>
  );
}
