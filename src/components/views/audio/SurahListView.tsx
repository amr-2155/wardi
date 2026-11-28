"use client";

import { Play, Pause, Clock, ArrowDownToLine, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/lib/locale";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatTime } from "@/hooks/useAudio";
import { audioProvider } from "@/lib/audio";
import {
  downloadTracks,
  removeSurahFromCache,
  surahCacheInfo,
} from "@/lib/audio/cache";
import { AudioPlayer } from "./AudioPlayer";

/**
 * SurahListView — shows all 114 surahs for the selected reciter.
 * Uses a lightweight, performant list (simple <button> rows, not heavy cards).
 * Each row shows: surah number, Arabic name, verse count, play button,
 * last-played indicator, and currently-playing highlight.
 */
export function SurahListView({
  onBack,
}: {
  onBack: () => void;
}) {
  const { t } = useLocale();
  const {
    surahs,
    currentSurah,
    currentReciter,
    currentTrack,
    resumePosition,
    player,
    actions: { loadSurah, pause, resume },
  } = useAudioPlayer();

  // Auto-load the last-played surah from settings if no surah is loaded yet.
  // (This is handled by AudioProvider on mount via persisted settings.)

  const handlePlay = (surah: number) => {
    if (currentSurah?.number === surah && player.isPlaying) {
      void pause();
    } else {
      void loadSurah(surah);
      // play() will be called once the track is loaded via AudioProvider
    }
  };

  // Determine if a surah row is currently playing
  const playingSurah = currentSurah?.number;

  /* Whole-surah downloads: pct while running, plus a version counter that
     re-reads the cache index after a download/delete finishes. */
  const [dlPct, setDlPct] = useState<Record<number, number>>({});
  const [cacheVersion, setCacheVersion] = useState(0);
  void cacheVersion;

  const handleDownload = async (surah: number) => {
    if (!currentReciter || dlPct[surah] !== undefined) return;
    setDlPct((prev) => ({ ...prev, [surah]: 0 }));
    try {
      const queue = await audioProvider.getSurahAudioQueue(currentReciter.id, surah);
      if (!queue) return;
      await downloadTracks(
        queue.tracks.map((tr) => tr.url),
        (done, total) =>
          setDlPct((prev) => ({ ...prev, [surah]: Math.round((done / total) * 100) }))
      );
    } finally {
      setDlPct((prev) => {
        const next = { ...prev };
        delete next[surah];
        return next;
      });
      setCacheVersion((v) => v + 1);
    }
  };

  const handleDeleteDownload = async (surah: number) => {
    await removeSurahFromCache(surah);
    setCacheVersion((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Reciter header with back */}
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-black text-muted hover:text-ink"
        >
          {t("ui.back")}
        </button>
        <div className="text-center">
          <span className="text-xs font-bold text-ink">
            {currentReciter?.name}
          </span>
          <span className="block text-[10px] text-muted">
            {currentReciter?.englishName}
          </span>
        </div>
        <div className="w-10" /> {/* spacer for centering */}
      </div>

      {/* Resume banner — saved fail-stop position (manual resume only) */}
      {resumePosition && !currentTrack && (
        <button
          type="button"
          onClick={() => void resume()}
          aria-label={t("audio.resume")}
          className="flex items-center justify-between gap-2 rounded-xl border border-gold/30 bg-primary-soft p-2.5 text-right"
        >
          <span className="flex-1 text-xs font-black text-ink">
            {t("audio.resumeLabel", {
              surah:
                surahs.find((s) => s.number === resumePosition.surah)?.name ??
                "",
              ayah: resumePosition.ayah,
            })}
          </span>
          <Play size={14} className="shrink-0 text-gold-strong" />
        </button>
      )}

      {/* Surah list */}
      <div className="flex flex-col gap-0.5">
        {surahs.map((s) => {
          const isPlaying = s.number === playingSurah && player.isPlaying;
          const isThisSurah = s.number === currentSurah?.number;

          const info = surahCacheInfo(s.number);
          const downloaded = info.count >= s.ayahCount && s.ayahCount > 0;
          const pct = dlPct[s.number];
          const sizeMb = (info.bytes / 1048576).toFixed(1);

          return (
            <div
              key={s.number}
              className={`flex items-center gap-1 rounded-xl border border-transparent pe-1 transition-colors ${
                isThisSurah
                  ? "border-gold/30 bg-primary-soft"
                  : "hover:bg-surface-2"
              } ${
                isPlaying
                  ? "bg-primary-deep text-white hover:bg-primary-deep"
                  : ""
              }`}
            >
            <button
              type="button"
              onClick={() => handlePlay(s.number)}
              className="flex flex-1 items-center gap-2 p-2.5 text-right"
              aria-label={
                isPlaying
                  ? `${t("audio.pause")} ${s.name}`
                  : `${t("audio.play")} ${s.name}`
              }
            >
              {/* Surah number badge */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                  isPlaying
                    ? "bg-white/20 text-white"
                    : "bg-primary-soft text-primary"
                }`}
              >
                {s.number}
              </div>

              {/* Surah info */}
              <div className="flex-1 text-right">
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={`text-sm font-black ${
                      isPlaying ? "text-white" : "text-ink"
                    }`}
                  >
                    {s.name}
                  </span>
                  {s.number === currentSurah?.number && !player.isPlaying && (
                    <Clock size={12} className="text-gold-strong" />
                  )}
                </div>
                <span className="text-[10px] text-muted">
                  {t("audio.ayahCount", { count: s.ayahCount })}
                </span>
              </div>

              {/* Play/pause indicator */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                {isPlaying ? (
                  <Pause size={16} className="text-white" />
                ) : isThisSurah && player.isLoading ? (
                  <span className="text-[10px] text-muted">...</span>
                ) : (
                  <Play
                    size={14}
                    className={
                      isPlaying ? "text-white" : "text-gold-strong"
                    }
                  />
                )}
              </div>
            </button>

            {/* Whole-surah download: icon → progress → size + delete */}
            {pct !== undefined ? (
              <span
                className={`flex h-8 w-11 shrink-0 items-center justify-center text-[10px] font-black ${
                  isPlaying ? "text-white/80" : "text-gold-strong"
                }`}
                aria-label={t("audio.downloadingPct", { pct })}
              >
                {pct}%
              </span>
            ) : downloaded ? (
              <button
                type="button"
                onClick={() => void handleDeleteDownload(s.number)}
                aria-label={`${t("audio.deleteDownload")} ${s.name}`}
                title={t("audio.deleteDownload")}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[10px] font-black ${
                  isPlaying ? "text-white/80" : "text-gold-strong"
                }`}
              >
                <Trash2 size={13} />
                {t("audio.downloadedSize", { size: sizeMb })}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDownload(s.number)}
                aria-label={`${t("audio.downloadSurah")} ${s.name}`}
                title={t("audio.downloadSurah")}
                disabled={!currentReciter}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition active:scale-95 disabled:opacity-40 ${
                  isPlaying ? "text-white/80" : "text-muted hover:bg-surface"
                }`}
              >
                <ArrowDownToLine size={14} />
              </button>
            )}
            </div>
          );
        })}
      </div>

      {/* Full player at the bottom */}
      {currentTrack && (
        <div className="pt-2">
          <AudioPlayer />
        </div>
      )}
    </div>
  );
}

// Re-export formatTime for other views if needed
export { formatTime };
