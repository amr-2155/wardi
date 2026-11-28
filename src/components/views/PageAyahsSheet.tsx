"use client";

import { Bookmark, BookOpen, Check, CircleAlert, Copy, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ReciterSheet } from "@/components/audio/ReciterSheet";
import { useAudioPlayer } from "@/components/providers/AudioProvider";
import { ActionButton } from "@/components/quran";
import { TafsirFoundation } from "@/components/TafsirFoundation";
import { TafsirPanel } from "@/components/TafsirPanel";
import { Sheet } from "@/components/ui";
import { usePublishedTafsirSource } from "@/hooks/usePublishedTafsirSource";
import type { QuranData } from "@/hooks/useQuran";
import { useLocale } from "@/lib/locale";
import { pageAyahs, toArabicIndic, type PageAyah } from "@/lib/quran/mushaf";
import { buildTafsirModel, type TafsirResult } from "@/lib/tafsir";
import { getDraftTafsir, isTafsirDraftPreviewEnabled } from "@/lib/tafsir/drafts";

/**
 * The mushaf pages are raster images: the app cannot know which pixels belong
 * to which ayah without a coordinates database, and we do not ship one (yet).
 * Until then this sheet is the honest equivalent of "tap an ayah": a long
 * press on the page (or the tools button) lists the ayahs printed on it —
 * from the bundled pagination metadata, never estimated positions — and each
 * row opens the actions: listen from this ayah, tafsir, copy, bookmark.
 */
export function PageAyahsSheet({
  open,
  onClose,
  quran,
  page,
}: {
  open: boolean;
  onClose: () => void;
  quran: QuranData;
  page: number | null;
}) {
  const { t } = useLocale();
  const audio = useAudioPlayer();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tafsirFor, setTafsirFor] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [reciterOpen, setReciterOpen] = useState(false);
  const [startingFor, setStartingFor] = useState<string | null>(null);

  const list = useMemo(
    () =>
      open && page !== null && quran.dataset && quran.meta
        ? pageAyahs(quran.dataset, quran.meta, page)
        : [],
    [open, page, quran.dataset, quran.meta],
  );

  /* A page turn or a close while the sheet was up must not leak the previous
     expansion into the next open. */
  useEffect(() => {
    if (!open) {
      setExpanded(null);
      setTafsirFor(null);
      setCopiedFor(null);
    }
  }, [open, page]);

  /* The tafsir pack loads only while an ayah's tafsir is actually requested,
     and retries when the requested ayah changes. */
  const publishedSource = usePublishedTafsirSource(
    open && tafsirFor !== null,
    tafsirFor,
  );
  const tafsirModel = tafsirFor
    ? buildTafsirModel(tafsirFor, quran.dataset, publishedSource.entries)
    : null;
  /* Same draft preview as the full ayah screen: opt-in via ?tafsirDrafts=1,
     and a shipped reviewed entry always wins. */
  const draftEntry =
    tafsirFor && isTafsirDraftPreviewEnabled() ? getDraftTafsir(tafsirFor) : null;
  const sheetDisplayModel: TafsirResult | null =
    tafsirModel &&
    draftEntry &&
    tafsirModel.status !== "unavailable" &&
    tafsirModel.entry.reviewStatus !== "reviewed"
      ? { status: "curated", context: tafsirModel.context, entry: draftEntry, provider: "curated" }
      : tafsirModel;

  const playingRef =
    audio.currentSurah && audio.currentTrack?.ayah !== undefined && audio.player.isPlaying
      ? `${audio.currentSurah.number}:${audio.currentTrack.ayah}`
      : null;
  const busy = startingFor !== null || audio.player.state === "loading";

  const handleListen = async (a: PageAyah) => {
    if (busy) return;
    if (!audio.currentReciter) {
      setReciterOpen(true);
      return;
    }
    setStartingFor(a.ref);
    try {
      await audio.actions.loadSurah(a.chapterId, a.verseNumber);
      audio.actions.play();
    } finally {
      setStartingFor(null);
    }
  };

  const handleCopy = async (a: PageAyah) => {
    try {
      await navigator.clipboard.writeText(a.text);
      setCopiedFor(a.ref);
      window.setTimeout(() => setCopiedFor((cur) => (cur === a.ref ? null : cur)), 1600);
    } catch {
      // Clipboard unavailable (permissions); nothing else to fall back to here.
    }
  };

  const row = (a: PageAyah) => {
    const isOpen = expanded === a.ref;
    const isPlaying = playingRef === a.ref;
    const bookmarked = quran.isBookmarked(a.ref);
    return (
      <li key={a.ref} className="rounded-2xl border border-line bg-surface-2/60">
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : a.ref)}
          aria-expanded={isOpen}
          className="w-full p-3 text-start"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-[10px] font-black text-gold-strong">
              {a.chapterName} · {toArabicIndic(a.verseNumber)}
            </span>
            {bookmarked && <Bookmark size={13} className="shrink-0 text-gold-strong" fill="currentColor" />}
          </div>
          <p
            className={`mt-2 font-quran text-base leading-[2.1] ${isOpen ? "" : "line-clamp-2"}`}
          >
            {a.text}
          </p>
        </button>

        {isOpen && (
          <div className="border-t border-line/60 p-3 pt-2.5">
            <div className="flex items-center gap-2">
              {isPlaying ? (
                <ActionButton label={t("audio.pause")} onClick={() => audio.actions.pause()}>
                  <Pause size={16} />
                </ActionButton>
              ) : (
                <ActionButton
                  label={busy && startingFor === a.ref ? t("mushaf.listenLoading") : t("audio.play")}
                  onClick={() => void handleListen(a)}
                >
                  <Play size={16} />
                </ActionButton>
              )}
              <ActionButton
                label={t("ayah.tafsirTitle")}
                active={tafsirFor === a.ref}
                onClick={() => setTafsirFor(tafsirFor === a.ref ? null : a.ref)}
              >
                <BookOpen size={16} />
              </ActionButton>
              <ActionButton label={t("quran.copy")} onClick={() => void handleCopy(a)}>
                {copiedFor === a.ref ? <Check size={16} /> : <Copy size={16} />}
              </ActionButton>
              <ActionButton
                label={t("quran.bookmark")}
                active={bookmarked}
                onClick={() => quran.toggleBookmark(a.ref)}
              >
                <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
              </ActionButton>
            </div>

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
              </div>
            )}
            {copiedFor === a.ref && (
              <p className="mt-2 animate-fade-up text-center text-[11px] font-bold text-success">
                {t("mushaf.ayahCopied")}
              </p>
            )}

            {tafsirFor === a.ref && sheetDisplayModel && (
              <section className="mt-3">
                {sheetDisplayModel.status === "unavailable" ? (
                  <p className="rounded-2xl border border-line bg-surface p-3 text-center text-[11px] font-bold text-muted">
                    {publishedSource.state === "loading"
                      ? t("tafsir.sourceLoading")
                      : publishedSource.state === "error"
                        ? t("tafsir.sourceUnavailable")
                        : t("mushaf.tafsirUnavailable")}
                  </p>
                ) : (
                  <TafsirPanel model={sheetDisplayModel} />
                )}
                {/* The unified per-ayah base follows the inline panel too, so a
                    page reader gets the same context + occasion of revelation. */}
                <div className="mt-3">
                  <TafsirFoundation
                    ayahRef={a.ref}
                    dataset={quran.dataset}
                    showAsbab={
                      sheetDisplayModel.status === "unavailable" ||
                      !sheetDisplayModel.entry.revelation
                    }
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t("mushaf.pageAyahsMenu")}>
        {list.length === 0 ? (
          <p className="py-6 text-center text-[12px] font-bold text-muted">
            {t("mushaf.pageAyahsEmpty")}
          </p>
        ) : (
          <ul className="-mx-5 flex max-h-[72dvh] flex-col gap-2 overflow-y-auto px-5 pb-2">
            {list.map(row)}
          </ul>
        )}
      </Sheet>
      <ReciterSheet open={reciterOpen} onClose={() => setReciterOpen(false)} />
    </>
  );
}
