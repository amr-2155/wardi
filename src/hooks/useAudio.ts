/**
 * useAudio — Minimal HTML5 Audio Player Hook
 *
 * A small, focused hook that wraps the native HTML5 <audio> element.
 * It exposes play/pause/seek/volume/prev-next state and uses native
 * audio events (loadedmetadata, timeupdate, ended, error, etc.) for
 * efficient state updates — no fixed-interval polling on the main
 * thread unless seeking actively.
 *
 * Design principles:
 * - ONE Audio instance per hook call (no multiple instances).
 * - State is driven by native audio events; no per-frame React updates.
 * - timeupdate events fire ~4–6 times/second natively (browser-throttled);
 *   we do NOT add our own setInterval. For seeking scrub bars, an
 *   optional `onScrubTime` callback is provided.
 * - Handles SSR safely (no window access at import time).
 * - Supports `onEnded` callback for sequential verse-to-verse playback.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AudioState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

export interface UseAudioOptions {
  src?: string;
  volume?: number;
  muted?: boolean;
  preload?: "none" | "metadata" | "auto";
  autoPlay?: boolean;
  onEnded?: () => void;
}

export interface UseAudioControls {
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  mute: () => void;
  unmute: () => void;
  load: (src: string) => void;
  reload: () => void;
  stop: () => void;
}

export interface UseAudioState {
  state: AudioState;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  bufferedEnd: number;
  error: string | null;
  canPlay: boolean;
}

export interface UseAudioReturn extends UseAudioState, UseAudioControls {}

/** Alias for backward compatibility. */
export type UseAudioResult = UseAudioReturn;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useAudio(opts: UseAudioOptions = {}): UseAudioReturn {
  const { src, volume = 1, muted = false, preload = "metadata", autoPlay = false, onEnded } = opts;

  const [state, setState] = useState<AudioState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeVal, setVolumeVal] = useState(Math.max(0, Math.min(1, volume)));
  const [mutedVal, setMutedVal] = useState(muted);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantsAutoPlayRef = useRef(autoPlay);
  const onEndedRef = useRef<(() => void) | undefined>(undefined);
  // Latest volume/mute, readable by the create-effect without making it a
  // dependency (see the note on that effect below).
  const volumeRef = useRef(volumeVal);
  const mutedRef = useRef(mutedVal);
  const srcRef = useRef(src);

  // Update the onEnded ref via effect (cannot update refs during render).
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Keep the imperative refs aligned with state so the create-effect can seed
  // the element without re-running.
  useEffect(() => {
    volumeRef.current = volumeVal;
  }, [volumeVal]);

  useEffect(() => {
    mutedRef.current = mutedVal;
  }, [mutedVal]);

  useEffect(() => {
    srcRef.current = src;
  }, [src]);

  // Lazy-create the Audio instance (SSR-safe).
  //
  // This effect must depend on `preload` ONLY. Volume, mute and onEnded are
  // applied imperatively (setVolume/mute/unmute) or read through refs
  // (onEndedRef). Listing them here used to re-run the effect on every volume
  // or mute change — and on every reciter change, because onEnded depends on
  // the selected reciter. Re-running tears the element down (pause + listener
  // removal + `audioRef.current = null`) and builds a fresh one with no `src`;
  // the `src` effect only depends on [src], so it never re-applies the source
  // and playback dies silently. One element per hook call, created once.
  useEffect(() => {
    if (audioRef.current) return;
    const audio = new Audio();
    audio.preload = preload;
    audio.volume = volumeRef.current;
    audio.muted = mutedRef.current;
    // Seed the source here as well, so a freshly created element is never
    // left without one. The dedicated src effect below cannot repair it: it
    // only runs when `src` changes, which it did not do.
    if (srcRef.current) {
      audio.src = srcRef.current;
      audio.load();
    }
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setState("ready");
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        setBufferedEnd(audio.buffered.end(audio.buffered.length - 1));
      }
    };

    const handlePlaying = () => {
      setState("playing");
    };

    const handlePause = () => {
      setState("paused");
    };

    const handleEnded = () => {
      setState("paused");
      setCurrentTime(0);
      if (onEndedRef.current) {
        onEndedRef.current();
      }
    };

    const handleError = () => {
      const code = audio.error?.code;
      let msg = "Playback error";
      if (code === 4) msg = "لم يتم العثور على ملف الصوت";
      if (code === 2 || code === 3) msg = "تعذر تشغيل الملف — تحقق من الاتصال";
      setErr(msg);
      setState("error");
    };

    const handleWaiting = () => {
      setState("loading");
    };

    const handleCanPlay = () => {
      setState("ready");
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("progress", handleProgress);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("progress", handleProgress);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audioRef.current = null;
    };
  }, [preload]);

  // Update src when it changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setErr(null);
    if (src && src !== audio.src) {
      audio.src = src;
      audio.load();
      setState("loading");
      if (wantsAutoPlayRef.current) {
        void audio.play().catch(() => {});
      }
    }
  }, [src]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    try {
      await audio.play();
    } catch {
      setErr("تعذر تشغيل الصوت — تحقق من إعدادات المتصفح");
      setState("error");
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(seconds, audio.duration || 0));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeVal(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedVal;
    setMutedVal(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, [mutedVal]);

  const mute = useCallback(() => {
    setMutedVal(true);
    if (audioRef.current) audioRef.current.muted = true;
  }, []);

  const unmute = useCallback(() => {
    setMutedVal(false);
    if (audioRef.current) audioRef.current.muted = false;
  }, []);

  const load = useCallback((newSrc: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    setErr(null);
    setCurrentTime(0);
    setDuration(0);
    setBufferedEnd(0);
    setState("loading");
    audio.src = newSrc;
    audio.load();
  }, []);

  const reload = useCallback(() => {
    audioRef.current?.load();
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setState("idle");
    setErr(null);
  }, []);

  const isPlaying = state === "playing";
  const isLoading = state === "loading" || state === "idle";

  return {
    state,
    isPlaying,
    isLoading,
    isMuted: mutedVal,
    currentTime,
    duration,
    volume: volumeVal,
    bufferedEnd,
    error: err,
    canPlay: state === "ready" || state === "playing" || state === "paused",
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
    mute,
    unmute,
    load,
    reload,
    stop,
  };
}

export { formatTime };
