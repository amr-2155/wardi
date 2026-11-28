"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AudioReciter, AudioSurah, AudioTrack, AudioTrackQueue } from "@/lib/audio";
import { audioProvider } from "@/lib/audio";
import { resolveAudioSrc } from "@/lib/audio/cache";
import { useAudio, type UseAudioResult } from "@/hooks/useAudio";
import {
  loadAudioSettings,
  saveAudioSettings,
  loadAudioResume,
  saveAudioResume,
  clearAudioResume,
  type AudioSettings,
  type AudioResumePosition,
} from "@/lib/audio/storage";
import { isOnline } from "@/lib/net/connectivity";
import {
  nextVerseIndex,
  resolveVerseFailureOutcome,
} from "@/lib/audio/playback";

export interface AudioPlayerState {
  /** Currently selected reciter (null if none selected) */
  currentReciter: AudioReciter | null;
  /** Currently loaded surah (null if none loaded) */
  currentSurah: AudioSurah | null;
  /** Whether the reciter list is loading */
  recitersLoading: boolean;
  /** Error from fetching reciters or audio */
  error: string | null;
  /** Saved position for manual resume after a fail-stop (null if none) */
  resumePosition: AudioResumePosition | null;
  /** The AudioTrack currently loaded (if any) */
  currentTrack: AudioTrack | null;
  /** All available reciters (populated after loadReciters) */
  reciters: AudioReciter[];
  /** All 114 surahs */
  surahs: AudioSurah[];
  /** Current playback speed multiplier (persisted in audio settings). */
  playbackRate: number;
  /** Whether each ayah replays instead of advancing (persisted). */
  repeatAyah: boolean;
  /** Sleep timer: epoch ms when playback should pause (null = off, session-only). */
  sleepTimerEndsAt: number | null;
}

export interface AudioPlayerActions {
  /** Fetch and load the reciter list. */
  loadReciters: () => Promise<void>;
  /** Select a reciter by ID. */
  selectReciter: (reciterId: string) => Promise<void>;
  /** Load and prepare a surah for playback. */
  loadSurah: (surah: number, startAyah?: number) => Promise<void>;
  /** Play the loaded track. */
  play: () => void;
  /** Pause playback. */
  pause: () => void;
  /** Seek to a position in seconds. */
  seek: (seconds: number) => void;
  /** Previous track (previous surah). */
  previous: () => void;
  /** Next track (next surah). */
  next: () => void;
  /** Set volume (0–1). */
  setVolume: (volume: number) => void;
  /** Mute/unmute. */
  mute: () => void;
  /** Unmute. */
  unmute: () => void;
  /** Clear everything and stop playback. */
  reset: () => void;
  /** Stop playback and clear the queue/track (keeps reciter + surah). */
  stop: () => void;
  /** Resume from the saved fail-stop position (if any). */
  resume: () => void;
  /** Set playback speed (persisted, applied to the live element). */
  setPlaybackRate: (rate: number) => void;
  /** Toggle repeat-each-ayah mode (persisted). */
  toggleRepeatAyah: () => void;
  /** Set a sleep timer in minutes (null cancels). Session-only. */
  setSleepTimer: (minutes: number | null) => void;
}

export type AudioPlayerContextValue = AudioPlayerState & {
  player: UseAudioResult;
  actions: AudioPlayerActions;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | undefined>(
  undefined
);

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error(
      "useAudioPlayer must be used within an AudioPlayerProvider"
    );
  }
  return ctx;
}

const SURAH_COUNT = 114;

// Message shown when a verse fails while the browser reports offline.
// The saved position lets the user resume manually once reconnected.
const OFFLINE_VERSE_MSG =
  "يبدو أنك غير متصل بالإنترنت. تم حفظ موضعك — تحقق من الاتصال ثم استأنف يدويًا.";

export function AudioPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // --- Reciter / surah data ---
  const [reciters, setReciters] = useState<AudioReciter[]>([]);
  const [surahs, setSurahs] = useState<AudioSurah[]>([]);
  const [recitersLoading, setRecitersLoading] = useState(false);
  const recitersLoadedRef = useRef(false);

  // --- Current playback state ---
  const [currentReciter, setCurrentReciter] = useState<AudioReciter | null>(
    null
  );
  const [currentSurah, setCurrentSurah] = useState<AudioSurah | null>(null);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Saved resume position for manual resume after a fail-stop (survives reload)
  const [resumePosition, setResumePosition] =
    useState<AudioResumePosition | null>(() => loadAudioResume());

  // --- Settings persistence ---
  const [settings, setSettings] = useState<AudioSettings>(() =>
    loadAudioSettings()
  );

  // Persist settings whenever they change
  useEffect(() => {
    saveAudioSettings(settings);
  }, [settings]);

  // Repeat mode + saved speed, readable from the onEnded callback.
  const repeatAyahRef = useRef(settings.repeatAyah);
  useEffect(() => {
    repeatAyahRef.current = settings.repeatAyah;
  }, [settings.repeatAyah]);

  // --- Sleep timer (session-only, never persisted) ---
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState<number | null>(null);
  const setSleepTimerCb = useCallback((minutes: number | null) => {
    setSleepTimerEndsAt(
      minutes !== null && minutes > 0 ? Date.now() + minutes * 60_000 : null
    );
  }, []);

  // --- Verse queue for sequential playback ---
  const [verseQueue, setVerseQueue] = useState<AudioTrackQueue | null>(null);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);

  // Refs to access latest values in the onEnded callback without
  // re-creating the useAudio instance on every render.
  const verseQueueRef = useRef<AudioTrackQueue | null>(null);
  const currentVerseIndexRef = useRef(0);
  const playerRef = useRef<UseAudioResult | null>(null);
  /* play() is called right after loadSurah() resolves, before React has
     re-rendered with the new track. A ref keeps play() from seeing the old
     (null) state and silently doing nothing. */
  const currentTrackRef = useRef<AudioTrack | null>(null);
  // Per-verse retry budget for fail-stop handling (reset on every new track)
  const verseRetryRef = useRef<{ url: string; retried: boolean }>({
    url: "",
    retried: false,
  });

  // Persist a resume position (saved verse) for manual resume.
  // Called on every verse advance and on every verse failure; cleared
  // ONLY when a surah genuinely completes.
  const persistResume = useCallback(
    (surah: number, ayah: number) => {
      const reciterId = settings.selectedReciter;
      if (!reciterId) return;
      const pos: AudioResumePosition = { surah, ayah, reciterId };
      saveAudioResume(pos);
      setResumePosition(pos);
    },
    [settings.selectedReciter]
  );

  /* Every track assignment goes through this setter so the ref is updated
     synchronously, not only after the next render. */
  const setTrack = useCallback((track: AudioTrack | null) => {
    currentTrackRef.current = track;
    setCurrentTrack(track);
  }, []);

  // onEnded callback for verse-to-verse transition
  const handleVerseEnded = useCallback(() => {
    const queue = verseQueueRef.current;
    const player = playerRef.current;
    if (!queue || queue.tracks.length === 0 || !player) {
      setTrack(null);
      return;
    }

    /* Memorization mode: replay the SAME verse instead of advancing. */
    if (repeatAyahRef.current) {
      const same = queue.tracks[currentVerseIndexRef.current];
      if (same) {
        void resolveAudioSrc(same.url).then((u) => {
          player.load(u);
          void player.play().catch(() => {
            setError("تعذر متابعة تشغيل السورة تلقائيًا. يرجى الضغط على زر التشغيل.");
          });
        });
        return;
      }
    }

    const nextIndex = nextVerseIndex(
      queue.tracks.length,
      currentVerseIndexRef.current
    );
    if (nextIndex !== null) {
      const nextTrack = queue.tracks[nextIndex];
      setTrack(nextTrack);
      setCurrentVerseIndex(nextIndex);
      persistResume(queue.surah, nextTrack.ayah ?? nextIndex + 1);
      // Through the bounded verse cache: a cached verse replays offline.
      void resolveAudioSrc(nextTrack.url).then((u) => {
        player.load(u);
        // Auto-resume playback for continuous surah playback
        void player.play().catch(() => {
          setError("تعذر متابعة تشغيل السورة تلقائيًا. يرجى الضغط على زر التشغيل.");
        });
      });
    } else {
      // Final verse ended — surah genuinely complete: clear saved position
      clearAudioResume();
      setResumePosition(null);
      setTrack(null);
    }
  }, [persistResume, setTrack]);

  // --- Core audio hook (HTML5 Audio) ---
  // The onEnded callback handles verse-to-verse sequential playback.
  const player = useAudio({
    onEnded: handleVerseEnded,
  });

  // Keep refs in sync (via effect to satisfy React refs rules)
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    verseQueueRef.current = verseQueue;
  }, [verseQueue]);

  useEffect(() => {
    currentVerseIndexRef.current = currentVerseIndex;
  }, [currentVerseIndex]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Apply the saved speed whenever it changes (imperative; never recreates
  // the audio element). Placed after the ref-sync effects: playerRef is
  // written above, and reading it earlier trips the immutability rule.
  useEffect(() => {
    playerRef.current?.setPlaybackRate(settings.playbackRate);
  }, [settings.playbackRate]);

  // Sleep timer countdown: pause when it fires (cleanup cancels on change).
    useEffect(() => {
    if (sleepTimerEndsAt === null) return;
    const id = setTimeout(() => {
      setSleepTimerEndsAt(null);
      playerRef.current?.pause();
    }, Math.max(0, sleepTimerEndsAt - Date.now()));
    return () => clearTimeout(id);
  }, [sleepTimerEndsAt]);

  // --- Load reciters + surahs on mount ---
  const loadReciters = useCallback(async () => {
    setRecitersLoading(true);
    try {
      const [recitersData, surahsData] = await Promise.all([
        audioProvider.getReciters(),
        audioProvider.getSurahs(),
      ]);
      setReciters(recitersData);
      setSurahs(surahsData);

      // Auto-select saved reciter if available
      if (settings.selectedReciter) {
        const savedReciter = recitersData.find(
          (r) => r.id === settings.selectedReciter
        );
        if (savedReciter) {
          setCurrentReciter(savedReciter);
        }
      }

      setError(null);
    } catch {
      setError(
        isOnline()
          ? "تعذر تحميل قائمة القراء. يرجى المحاولة لاحقًا."
          : "يبدو أنك غير متصل بالإنترنت. تحقق من الاتصال ثم أعد المحاولة."
      );
      // Fall back to static surah data so UI still works
      const fallbackSurahs = await audioProvider.getSurahs();
      setSurahs(fallbackSurahs);
    } finally {
      setRecitersLoading(false);
    }
    recitersLoadedRef.current = true;
  }, [settings.selectedReciter]);

  useEffect(() => {
    if (!recitersLoadedRef.current) {
      void loadReciters();
    }
  }, [loadReciters]);

  // --- Audio event sync: verse failure → retry once, then fail-stop ---
  // Fail-stop means: NEVER advance to the next verse on error (skipping a
  // failed verse would silently alter the recitation). Instead the position
  // is saved for manual resume. The retry budget resets on every new track.
  useEffect(() => {
    verseRetryRef.current = { url: "", retried: false };
  }, [currentTrack?.url]);

  useEffect(() => {
    if (!player.error || !currentTrack || !currentSurah) return;
    const reciterId = settings.selectedReciter;
    if (!reciterId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(player.error);
      return;
    }
    const trackUrl = currentTrack.url;
    const ayah = currentTrack.ayah ?? currentVerseIndex + 1;
    if (verseRetryRef.current.url !== trackUrl) {
      verseRetryRef.current = { url: trackUrl, retried: false };
    }
    if (
      resolveVerseFailureOutcome(verseRetryRef.current.retried) ===
      "retry-same"
    ) {
      // Single retry of the SAME verse — position is saved first so a
      // second identical failure still leaves a valid resume point.
      verseRetryRef.current.retried = true;
      persistResume(currentSurah.number, ayah);
      void resolveAudioSrc(trackUrl).then((u) => {
        player.load(u);
        void player.play().catch(() => {
          // A play rejection surfaces again via player.error → fail-stop below.
        });
      });
      return;
    }
    // Fail-stop: save position for manual resume, do not advance.
    persistResume(currentSurah.number, ayah);
    setError(isOnline() ? player.error : OFFLINE_VERSE_MSG);
  }, [
    player.error,
    currentTrack,
    currentSurah,
    currentVerseIndex,
    player,
    settings.selectedReciter,
    persistResume,
  ]);

  // --- Actions ---

  // Internal: load a surah for a specific reciter.
  // Loads the verse-level audio queue for sequential playback.
  // startAyah (default 1) supports manual resume from a saved position.
  const loadSurahInternal = useCallback(
    async (surahNum: number, reciterId?: string, startAyah = 1) => {
      const reciterIdResolved = reciterId ?? settings.selectedReciter;
      if (!reciterIdResolved) {
        setError("اختر قارئًا أولًا.");
        return;
      }

      // Validate surah number
      if (surahNum < 1 || surahNum > SURAH_COUNT) {
        setError("رقم السورة غير صالح.");
        return;
      }

      const surahData = surahs.find((s) => s.number === surahNum);
      if (!surahData) {
        setError("لم يتم العثر على السورة.");
        return;
      }

      setError(null);
      setCurrentSurah(surahData);

      // Clamp the resume verse into the surah range (default: verse 1)
      const startAyahSafe =
        Number.isInteger(startAyah) &&
        startAyah >= 1 &&
        startAyah <= surahData.ayahCount
          ? startAyah
          : 1;
      const startIndex = startAyahSafe - 1;

      // Clear previous queue
      setVerseQueue(null);
      setCurrentVerseIndex(startIndex);
      setTrack(null);

      try {
        const queue = await audioProvider.getSurahAudioQueue(
          reciterIdResolved,
          surahNum
        );
        if (!queue || queue.tracks.length === 0) {
          setError(
            isOnline()
              ? "تعذر العثور على ملف الصوت للسورة."
              : "يبدو أنك غير متصل بالإنترنت. تحقق من الاتصال ثم أعد المحاولة."
          );
          setTrack(null);
          return;
        }

        setVerseQueue(queue);
        const firstTrack = queue.tracks[startIndex] ?? queue.tracks[0];
        setTrack(firstTrack);
        setCurrentVerseIndex(startIndex);

        // Load the first verse into the player (through the verse cache).
        void resolveAudioSrc(firstTrack.url).then((u) => player.load(u));
      } catch {
        setError(
          isOnline()
            ? "حدث خطأ أثناء تحميل الصوت."
            : "يبدو أنك غير متصل بالإنترنت. تحقق من الاتصال ثم أعد المحاولة."
        );
        setTrack(null);
      }
    },
    [settings.selectedReciter, surahs, player, setTrack]
  );

  const selectReciter = useCallback(
    async (reciterId: string) => {
      const reciter = reciters.find((r) => r.id === reciterId);
      if (!reciter) {
        setError("لم يتم العثر على القارئ المطلوب.");
        return;
      }

      setCurrentReciter(reciter);
      setSettings((prev) => ({ ...prev, selectedReciter: reciterId }));

      // If we had a track loaded, reload it with the new reciter
      if (currentSurah) {
        await loadSurahInternal(currentSurah.number, reciterId);
      }

      setError(null);
    },
    [reciters, currentSurah, loadSurahInternal]
  );

  const loadSurah = useCallback(
    (surahNum: number, startAyah?: number) =>
      loadSurahInternal(surahNum, undefined, startAyah),
    [loadSurahInternal]
  );

  const selectReciterCb = useCallback(
    (reciterId: string) => selectReciter(reciterId),
    [selectReciter]
  );

  // Resume from a saved fail-stop position (manual only — never autoplayed).
  const resumeCb = useCallback(async () => {
    const pos = loadAudioResume();
    if (!pos) return;
    const reciter = reciters.find((r) => r.id === pos.reciterId);
    if (reciter) {
      setCurrentReciter(reciter);
      setSettings((prev) => ({ ...prev, selectedReciter: pos.reciterId }));
    }
    await loadSurahInternal(pos.surah, pos.reciterId, pos.ayah);
  }, [reciters, loadSurahInternal]);

  const playCb = useCallback(() => {
    /* Never bail on a stale render-time `currentTrack`: loadSurah() sets the
       track and resolves in the same async action that then calls play(). */
    if (!currentTrackRef.current) return;
    void player.play();
  }, [player]);

  const pauseCb = useCallback(() => {
    player.pause();
  }, [player]);

  const seekCb = useCallback(
    (seconds: number) => {
      player.seek(seconds);
    },
    [player]
  );

  const previousCb = useCallback(() => {
    // Previous → previous surah
    if (!currentSurah || currentSurah.number <= 1) return;
    void loadSurahInternal(currentSurah.number - 1);
  }, [currentSurah, loadSurahInternal]);

  const nextCb = useCallback(() => {
    // Next → next surah
    if (!currentSurah || currentSurah.number >= SURAH_COUNT) return;
    void loadSurahInternal(currentSurah.number + 1);
  }, [currentSurah, loadSurahInternal]);

  const setVolumeCb = useCallback(
    (volume: number) => {
      player.setVolume(volume);
      setSettings((prev) => ({ ...prev, volume }));
    },
    [player]
  );

  const muteCb = useCallback(() => {
    player.mute();
  }, [player]);

  const unmuteCb = useCallback(() => {
    player.unmute();
  }, [player]);

  const resetCb = useCallback(() => {
    player.stop();
    setCurrentReciter(null);
    setCurrentSurah(null);
    setTrack(null);
    setVerseQueue(null);
    setCurrentVerseIndex(0);
    setError(null);
  }, [player, setTrack]);

  const stopCb = useCallback(() => {
    player.stop();
    setTrack(null);
    setVerseQueue(null);
    setCurrentVerseIndex(0);
    setError(null);
  }, [player, setTrack]);

  // Restore playback position when a surah is reloaded
  useEffect(() => {
    if (currentTrack && currentSurah && settings.lastPlayedSurah === currentSurah.number) {
      // Seek to saved position if within the track
      const pos = settings.lastPosition;
      if (pos > 0) {
        // Use a setTimeout to ensure the audio metadata is loaded
        const id = setTimeout(() => {
          player.seek(pos);
        }, 500);
        return () => clearTimeout(id);
      }
    }
  }, [currentTrack, currentSurah, player, settings.lastPlayedSurah, settings.lastPosition]);

  // Persist last played surah when it changes
  useEffect(() => {
    if (currentSurah) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings((prev) => ({ ...prev, lastPlayedSurah: currentSurah.number }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSurah?.number]);

  const setPlaybackRateCb = useCallback((rate: number) => {
    setSettings((prev) => ({ ...prev, playbackRate: rate }));
  }, []);

  const toggleRepeatAyahCb = useCallback(() => {
    setSettings((prev) => ({ ...prev, repeatAyah: !prev.repeatAyah }));
  }, []);

  const contextValue: AudioPlayerContextValue = {
    // State
    currentReciter,
    currentSurah,
    recitersLoading,
    error,
    resumePosition,
    currentTrack,
    // Data
    reciters,
    surahs,
    playbackRate: settings.playbackRate,
    repeatAyah: settings.repeatAyah,
    sleepTimerEndsAt,
    // Player
    player,
    // Actions
    actions: {
      loadReciters,
      selectReciter: selectReciterCb,
      loadSurah,
      play: playCb,
      pause: pauseCb,
      seek: seekCb,
      previous: previousCb,
      next: nextCb,
      setVolume: setVolumeCb,
      mute: muteCb,
      unmute: unmuteCb,
      reset: resetCb,
      stop: stopCb,
      resume: resumeCb,
      setPlaybackRate: setPlaybackRateCb,
      toggleRepeatAyah: toggleRepeatAyahCb,
      setSleepTimer: setSleepTimerCb,
    },
  };

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {children}
    </AudioPlayerContext.Provider>
  );
}
