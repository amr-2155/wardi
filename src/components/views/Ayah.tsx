"use client";

import { ArrowRight, BookMarked, CircleAlert, Pause, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { ReciterSheet } from "@/components/audio/ReciterSheet";
import { useAudioPlayer } from "@/components/providers/AudioProvider";
import { AyahActionBar, AyahMetaFooter, RelatedItem, SurahBadge, VerseText } from "@/components/quran";
import { TafsirFoundation } from "@/components/TafsirFoundation";
import { TafsirPanel } from "@/components/TafsirPanel";
import { TafsirSections } from "@/components/TafsirSections";
import { ScreenHeader } from "@/components/ui";
import { DatasetNotice } from "@/components/DatasetNotice";
import { useLocale, type Locale } from "@/lib/locale";
import { buildTafsirModel, isTafsirAIEnabled, type TafsirResult } from "@/lib/tafsir";
import { getDraftTafsir, isTafsirDraftPreviewEnabled } from "@/lib/tafsir/drafts";
import { usePublishedTafsirSource } from "@/hooks/usePublishedTafsirSource";
import { useTafsirGeneration } from "@/hooks/useTafsirGeneration";
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
  const audio = useAudioPlayer();
  const [copied, setCopied] = useState(false);
  const [reciterOpen, setReciterOpen] = useState(false);
  const [startingFor, setStartingFor] = useState<string | null>(null);
  const resolved = quran.getAyah(ayahId);
  const related = quran.getRelated(ayahId);
  const topics = quran.getTopics(ayahId);
  const tafsir = quran.getTafsir(ayahId);
  /* The effect-only loader keeps the network out of render; the loader caches
     a verified pack for the session, and the ayah ref lets a failed load retry
     when the reader moves to another verse. */
  const publishedSource = usePublishedTafsirSource(true, ayahId);
  /* Reviewed rich entry first, then the pinned published edition. */
  const tafsirModel = buildTafsirModel(ayahId, quran.dataset, publishedSource.entries);
  const generation = useTafsirGeneration(ayahId, quran.dataset, publishedSource.entries);
  /* A curated or published source always beats a generated draft, including a
     draft that started before the async source finished loading. */
  const shownModel =
    tafsirModel.status === "unavailable" ? (generation.model ?? tafsirModel) : tafsirModel;
  /* Draft review preview (?tafsirDrafts=1): shows an unreviewed draft through
     the real article renderer so wording can be judged exactly as readers
     would see it. A shipped reviewed entry always wins; drafts never merge
     into the reviewed pack. */
  const draftEntry = isTafsirDraftPreviewEnabled() ? getDraftTafsir(ayahId) : null;
  const shownIsReviewed =
    shownModel.status !== "unavailable" && shownModel.entry.reviewStatus === "reviewed";
  const displayModel: TafsirResult =
    draftEntry && shownModel.status !== "unavailable" && !shownIsReviewed
      ? { status: "curated", context: shownModel.context, entry: draftEntry, provider: "curated" }
      : shownModel;
  /* State WHY honestly rather than silently hiding the tafsir section. */
  const tafsirNotice =
    tafsirModel.status !== "unavailable"
      ? "tadabbur.noTafsirHint"
      : tafsirModel.reason === "no-dataset"
        ? "tafsir.unavailable.noDataset"
        : tafsirModel.reason === "invalid-ref"
          ? "tafsir.unavailable.invalidRef"
          : publishedSource.state === "loading"
            ? "tafsir.sourceLoading"
            : publishedSource.state === "error"
              ? "tafsir.sourceUnavailable"
              : tafsirModel.aiEnabled
                ? "tafsir.unavailable.noSource"
                : "tafsir.unavailable.aiDisabled";
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

  const starting = startingFor === ayahId;
  const playingThis =
    audio.currentTrack?.surah === chapter.id &&
    audio.currentTrack?.ayah === verse.number &&
    audio.player.isPlaying;
  // `isLoading` is also true before any track exists (state === "idle"), which
  // would disable the very button that opens the reciter picker. Only a real
  // in-flight load should block a second tap.
  const busy = starting || audio.player.state === "loading";

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

      {/* RECITATION — same engine as the reader's ayah menu. */}
      <div className="mt-2">
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
      {displayModel.status !== "unavailable" ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold-strong" />
            <h3 className="text-sm font-black">{t("ayah.tafsirTitle")}</h3>
          </div>
          <TafsirPanel model={displayModel} />
        </section>
      ) : tafsir ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold-strong" />
            <h3 className="text-sm font-black">{t("ayah.tafsirTitle")}</h3>
          </div>
          <TafsirSections tafsir={tafsir} />
        </section>
      ) : (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-gold-strong" />
            <h3 className="text-sm font-black">{t("ayah.tafsirTitle")}</h3>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-xs font-black text-ink">{t("tadabbur.noTafsirTitle")}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">{t(tafsirNotice)}</p>
            {isTafsirAIEnabled() && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={generation.generate}
                  disabled={generation.state === "loading"}
                  className="flex h-10 items-center gap-2 rounded-xl border border-gold/40 bg-gold-soft px-3 text-xs font-black text-gold-strong transition active:scale-[0.98] disabled:opacity-60"
                >
                  <Sparkles size={14} />
                  {t(
                    generation.state === "loading"
                      ? "tafsir.generating"
                      : "tafsir.action.generate"
                  )}
                </button>
                {generation.state === "error" && (
                  <p className="mt-2 text-[11px] leading-5 text-danger">
                    {t("tafsir.generatedError")}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Unified per-ayah foundation: mushaf context (neighboring verses from
          the verified dataset) + occasion of revelation with an honest
          "none established" line. Never guesses. */}
      <section className="mt-6">
        <TafsirFoundation
          ayahRef={ayahId}
          dataset={quran.dataset}
          showAsbab={
            displayModel.status === "unavailable" || !displayModel.entry.revelation
          }
        />
      </section>

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

      {/* The source is a long Latin run inside an Arabic page. Without an
          explicit LTR isolate the bidi algorithm flips the parentheses and
          drags the source label to the wrong end of the line, and the
          unbreakable URL overflows the phone width. So each Latin part gets
          its own isolated line. */}
      <div className="mt-6 space-y-1 text-center text-[10px] leading-5 text-muted">
        <p>
          {t("ayah.source")} <bdi dir="ltr">{DATASET_META.source}</bdi>
        </p>
        <bdi dir="ltr" className="block break-all">{DATASET_META.sourceUrl}</bdi>
      </div>

      <ReciterSheet open={reciterOpen} onClose={() => setReciterOpen(false)} />
    </div>
  );
}
