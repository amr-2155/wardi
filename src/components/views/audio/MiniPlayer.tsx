"use client";

import { Pause, Play, ChevronUp } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatTime } from "@/hooks/useAudio";

/**
 * MiniPlayer — a compact player bar that appears at the bottom of the screen
 * when a track is loaded. It shows surah name, reciter name, play/pause,
 * a progress bar, and a button to expand to the full player.
 *
 * Respects safe-area insets so it never overlaps with BottomNav on mobile.
 */
export function MiniPlayer() {
  const { t } = useLocale();
  const {
    currentSurah,
    currentReciter,
    currentTrack,
    player,
    actions: { play, pause },
  } = useAudioPlayer();

  // Only render when a track is loaded.
  if (!currentTrack || !currentSurah) return null;

  const progressPct =
    player.duration > 0
      ? (player.currentTime / player.duration) * 100
      : 0;

  const handlePlayPause = () => {
    if (player.isPlaying) {
      void pause();
    } else {
      void play();
    }
  };

  const handleExpand = () => {
    // This dispatches to the AudioPlayer via the global AudioContext
    // In a real implementation, this would navigate to the full player view.
    // For V1, the full player is already visible below the surah list,
    // so the MiniPlayer is primarily for when the user is in other tabs.
  };

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 mx-4 flex flex-col gap-1 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      role="region"
      aria-label={t("audio.nowPlaying")}
    >
      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-line/30">
        <div
          className="h-full rounded-full bg-gold transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between px-1">
        {/* Track info */}
        <div className="flex-1 text-right">
          <p className="text-xs font-black text-ink">
            {currentSurah?.name || ""}
          </p>
          <p className="text-[10px] text-muted">
            {currentReciter?.name || ""}
          </p>
        </div>

        {/* Play / pause */}
        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={player.isPlaying ? t("audio.pause") : t("audio.play")}
          className="flex h-7 w-7 items-center justify-center rounded-xl bg-gold text-primary-deep hover:bg-gold-hover focus:outline-none focus:ring-2 focus:ring-gold"
        >
          {player.isPlaying ? (
            <Pause size={14} />
          ) : (
            <Play size={14} />
          )}
        </button>

        {/* Expand button */}
        <button
          type="button"
          onClick={handleExpand}
          aria-label={t("audio.expandPlayer")}
          className="rounded-xl p-1 text-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-gold"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* Time */}
      <div className="flex justify-between text-[9px] text-muted">
        <span>{formatTime(player.currentTime)}</span>
        <span>{formatTime(player.duration)}</span>
      </div>
    </div>
  );
}
