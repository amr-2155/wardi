"use client";

import { FastForward, Pause, Play, Repeat, SkipBack, SkipForward, Timer, Volume2, VolumeX, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/locale";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { formatTime } from "@/hooks/useAudio";

/**
 * AudioPlayer — the full-width player shown below the surah list.
 * Shows reciter name, surah name, play/pause, prev/next, seek bar,
 * current time / duration, and volume controls.
 *
 * Uses the global useAudioPlayer() context.
 */
export function AudioPlayer() {
  const { t } = useLocale();
  const {
    currentReciter,
    currentSurah,
    player,
    playbackRate,
    repeatAyah,
    autoNextSurah,
    sleepTimerEndsAt,
    actions: { play, pause, seek, setVolume, mute, unmute, previous, next, setPlaybackRate, toggleRepeatAyah, toggleAutoNextSurah, setSleepTimer },
  } = useAudioPlayer();

  // Sleep timer menu + remaining-minutes countdown.
  const [sleepOpen, setSleepOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepTimerEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepTimerEndsAt]);
  const sleepRemainingMin =
    sleepTimerEndsAt === null
      ? null
      : Math.max(0, Math.ceil((sleepTimerEndsAt - now) / 60000));

  // Speed cycles through the common recitation speeds.
  const RATES = [1, 1.25, 1.5, 0.75];
  const cycleRate = () => {
    const idx = RATES.indexOf(playbackRate);
    setPlaybackRate(RATES[(idx + 1) % RATES.length] ?? 1);
  };

  // Update seek position on user drag
  const seekbarRef = useRef<HTMLButtonElement>(null);

  const handleSeek = (e: React.MouseEvent) => {
    if (!seekbarRef.current || player.duration === 0) return;
    const rect = seekbarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * player.duration;
    void seek(newTime);
  };

  const handleSeekKeyDown = (e: React.KeyboardEvent) => {
    if (!seekbarRef.current || player.duration === 0) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -5 : 5;
      const newTime = Math.max(0, Math.min(player.duration, player.currentTime + delta));
      void seek(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const toggleMute = () => {
    if (player.isMuted) {
      unmute();
    } else {
      mute();
    }
  };

  const handlePlayPause = () => {
    if (!currentSurah) return;
    if (player.isPlaying) {
      void pause();
    } else {
      void play();
    }
  };

  const duration = player.duration || 0;
  const currentTime = player.currentTime || 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const isDisabled = !currentSurah || player.state === "error";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3">
      {/* Top row: reciter + surah */}
      <div className="flex items-center justify-between">
        <div className="flex-1 text-right">
          <p className="text-sm font-black text-ink">
            {currentSurah?.name || t("audio.surahs")}
          </p>
          <p className="text-xs text-muted">
            {currentReciter?.name || ""}
          </p>
        </div>
        {player.state === "loading" && (
          <Loader2 size={16} className="animate-spin text-gold-strong" />
        )}
        {player.state === "error" && (
          <span className="text-[10px] font-bold text-danger">
            {t("audio.error")}
          </span>
        )}
      </div>

      {/* Seek bar */}
      <button
        type="button"
        ref={seekbarRef}
        onClick={handleSeek}
        onKeyDown={handleSeekKeyDown}
        tabIndex={isDisabled ? -1 : 0}
        aria-label={t("audio.seek")}
        className="relative h-1.5 w-full cursor-pointer rounded-full bg-line/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold disabled:cursor-not-allowed"
        disabled={isDisabled}
      >
        <div
          className="h-full rounded-full bg-gold"
          style={{ width: `${progressPct}%` }}
        />
      </button>

      {/* Time display */}
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Volume */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={player.isMuted ? t("audio.unmute") : t("audio.mute")}
            className="rounded-xl p-1 text-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-gold"
          >
            {player.isMuted ? (
              <VolumeX size={16} />
            ) : (
              <Volume2 size={16} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.isMuted ? 0 : player.volume}
            onChange={handleVolumeChange}
            aria-label={t("audio.volume")}
            className="w-16 accent-gold"
          />
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!currentSurah) return;
              void previous();
            }}
            aria-label={t("audio.previous")}
            disabled={!currentSurah}
            className="rounded-xl p-1.5 text-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipBack size={16} />
          </button>

          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={player.isPlaying ? t("audio.pause") : t("audio.play")}
            disabled={isDisabled}
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gold text-primary-deep hover:bg-gold-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {player.isPlaying ? (
              <Pause size={18} />
            ) : player.isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Play size={18} />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!currentSurah) return;
              void next();
            }}
            aria-label={t("audio.next")}
            disabled={!currentSurah}
            className="rounded-xl p-1.5 text-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>

      {/* Extras row: repeat ayah, auto next surah, playback speed, sleep timer */}
      <div className="flex items-center justify-between border-t border-line/40 pt-2">
        <button
          type="button"
          onClick={toggleRepeatAyah}
          aria-label={t("audio.repeatAyah")}
          aria-pressed={repeatAyah}
          title={t("audio.repeatAyah")}
          className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-gold ${
            repeatAyah ? "bg-gold-soft text-gold-strong" : "text-muted hover:bg-surface"
          }`}
        >
          <Repeat size={14} />
          {t("audio.repeatAyah")}
        </button>

        <button
          type="button"
          onClick={toggleAutoNextSurah}
          aria-label={t("audio.autoNextSurah")}
          aria-pressed={autoNextSurah}
          title={t("audio.autoNextSurah")}
          className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-gold ${
            autoNextSurah ? "bg-gold-soft text-gold-strong" : "text-muted hover:bg-surface"
          }`}
        >
          <FastForward size={14} />
          {t("audio.autoNextSurah")}
        </button>

        <button
          type="button"
          onClick={cycleRate}
          aria-label={t("audio.playbackSpeed")}
          title={t("audio.playbackSpeed")}
          className="rounded-xl px-2 py-1 text-[11px] font-black text-muted hover:bg-surface focus:outline-none focus:ring-2 focus:ring-gold"
        >
          {playbackRate}×
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSleepOpen((v) => !v)}
            aria-label={t("audio.sleepTimer")}
            aria-expanded={sleepOpen}
            title={t("audio.sleepTimer")}
            className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-gold ${
              sleepTimerEndsAt !== null ? "bg-gold-soft text-gold-strong" : "text-muted hover:bg-surface"
            }`}
          >
            <Timer size={14} />
            {sleepRemainingMin !== null
              ? t("audio.sleepRemaining", { min: sleepRemainingMin })
              : t("audio.sleepTimer")}
          </button>
          {sleepOpen && (
            <div className="absolute bottom-full end-0 z-20 mb-1 w-28 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setSleepTimer(null);
                  setSleepOpen(false);
                }}
                className="block w-full px-3 py-2 text-start text-[11px] font-bold text-ink hover:bg-surface-2"
              >
                {t("audio.sleepOff")}
              </button>
              {[5, 15, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSleepTimer(m);
                    setSleepOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-start text-[11px] font-bold text-ink hover:bg-surface-2"
                >
                  {t("audio.sleepMin", { min: m })}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
