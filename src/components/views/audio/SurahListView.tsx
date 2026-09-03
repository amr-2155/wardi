"use client";

import { Play, Pause, Clock } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatTime } from "@/hooks/useAudio";
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
    player,
    actions: { loadSurah, pause },
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

      {/* Surah list */}
      <div className="flex flex-col gap-0.5">
        {surahs.map((s) => {
          const isPlaying = s.number === playingSurah && player.isPlaying;
          const isThisSurah = s.number === currentSurah?.number;

          return (
            <button
              key={s.number}
              type="button"
              onClick={() => handlePlay(s.number)}
              className={`flex items-center gap-2 rounded-xl border border-transparent p-2.5 text-right transition-colors ${
                isThisSurah
                  ? "border-gold/30 bg-primary-soft"
                  : "hover:bg-surface-2"
              } ${
                isPlaying
                  ? "bg-primary-deep text-white hover:bg-primary-deep"
                  : ""
              }`}
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
                  {s.ayahCount} {t("audio.ayahCount", { count: s.ayahCount })}
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
