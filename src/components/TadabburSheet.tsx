"use client";

import { BookOpen, CircleAlert, Pause, Play } from "lucide-react";
import { useState } from "react";
import { ReciterSheet } from "@/components/audio/ReciterSheet";
import { useAudioPlayer } from "@/components/providers/AudioProvider";
import { AyahActionBar } from "@/components/quran";
import { TafsirPanel } from "@/components/TafsirPanel";
import { TadabburSection } from "@/components/views/TadabburSection";
import { Sheet } from "@/components/ui";
import { usePublishedTafsirSource } from "@/hooks/usePublishedTafsirSource";
import type { QuranData } from "@/hooks/useQuran";
import { useLocale } from "@/lib/locale";
import { buildTafsirModel } from "@/lib/tafsir";
import { shareVerseCard } from "@/lib/shareCard";

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
  const audio = useAudioPlayer();
  const [copied, setCopied] = useState(false);
  const [reciterOpen, setReciterOpen] = useState(false);
  const [startingFor, setStartingFor] = useState<string | null>(null);
  // A finished ward's reflection is grounded in the pages actually read.
  const ayahId = quran.reflectionAyah || quran.daily?.ref || "";
  const resolved = quran.getAyah(ayahId);
  /* The mushaf tafsir button opens this sheet for a page-local ayah. Load the
     pinned edition only while the sheet is open, and retry it when the
     grounded ayah changes. */
  const publishedSource = usePublishedTafsirSource(
    open && Boolean(ayahId),
    open ? ayahId : null
  );
  const tafsirModel = buildTafsirModel(ayahId, quran.dataset, publishedSource.entries);

  /* A daily ayah and a loaded dataset are all that is required. This used to
     also demand a curated tafsir entry, but only 24 ayahs have one, so the
     whole sheet silently returned null for almost every day. */
  if (!open || !resolved) return null;

  const { verse, chapter } = resolved;
  const legacyTafsir = quran.getTafsir(ayahId);
  const showPublishedTafsir = !legacyTafsir && tafsirModel.status !== "unavailable";
  const starting = startingFor === ayahId;
  const playingThis =
    audio.currentTrack?.surah === chapter.id &&
    audio.currentTrack?.ayah === verse.number &&
    audio.player.isPlaying;
  // `isLoading` is also true before any track exists (state === "idle"), which
  // would disable the very button that opens the reciter picker. Only a real
  // in-flight load should block a second tap.
  const busy = starting || audio.player.state === "loading";
  const sourceNotice =
    legacyTafsir || showPublishedTafsir
      ? null
      : publishedSource.state === "loading"
        ? "tafsir.sourceLoading"
        : publishedSource.state === "error"
          ? "tafsir.sourceUnavailable"
          : null;

  const handleListen = async () => {
    if (starting) return;
    if (!audio.currentReciter) {
      setReciterOpen(true);
      return;
    }
    setStartingFor(ayahId);
    try {
      await audio.actions.loadSurah(chapter.id, verse.number);
      audio.actions.play();
    } finally {
      setStartingFor(null);
    }
  };

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
    <>
      <Sheet open onClose={onClose} title={t("tadabbur.title")}>
        <div className="-mx-5 max-h-[72dvh] overflow-y-auto px-5 pb-2">
          <TadabburSection
            candidate={ayahId}
            candidateResolved={resolved}
            wardDay={quran.wardDay}
            quran={quran}
            showHeader={false}
            sourceNotice={sourceNotice}
          />

          {/* RECITATION */}
          <div className="mt-3">
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

          {/* TAFSIR — the legacy curated card owns the four reflective sections.
              Every other ayah gets the pinned reviewed/published panel here. */}
          {showPublishedTafsir && (
            <section className="mt-4">
              <div className="mb-3 flex items-center gap-1.5">
                <BookOpen size={14} className="text-gold-strong" />
                <h3 className="text-sm font-black">{t("ayah.tafsirTitle")}</h3>
              </div>
              <TafsirPanel model={tafsirModel} />
            </section>
          )}

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
            <BookOpen size={15} />
            {t("tadabbur.fullTafsir")}
          </button>

          {copied && (
            <p className="mt-2 animate-fade-up text-center text-[11px] font-bold text-success">
              تم نسخ الآية ✓
            </p>
          )}
        </div>
      </Sheet>
      <ReciterSheet open={reciterOpen} onClose={() => setReciterOpen(false)} />
    </>
  );
}
