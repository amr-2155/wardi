"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RELATIONS, TOPICS, TAFSIR } from "@/data/quran";
import { subscribeConnectivity } from "@/lib/net/connectivity";
import type { AyahMeta, QuranDataset, QuranSearchResult, TafsirEntry, WardProgress } from "@/lib/quran/types";
import { getRelatedAyahs } from "@/lib/quran/relations";
import { getTafsir, tadabburPool } from "@/lib/quran/tafsir";
import { getDailyAyah, dateKeyOf } from "@/lib/quran/daily";
import { searchWithIndex, buildSearchIndex, getVerseTopics } from "@/lib/quran/search";
import { loadAyahMeta, loadHashes } from "@/lib/quran/store";
import { loadDatasetWithStatus, type DatasetUiStatus } from "@/lib/quran/dataset-status";
import { createReloadCoordinator, runCoordinatedReload, shouldReloadQuranData } from "@/lib/quran/dataset-reload";
import {
  advancePages,
  ayahQuotaForPages,
  buildWardProgress,
  finishWard,
} from "@/lib/quran/progress";
import { resolveAyah } from "@/lib/quran/validate";
import {
  loadDaily,
  saveDaily,
  loadBookmarks,
  saveBookmarks,
  loadWardDay,
  saveWardDay,
  loadQuranProgress,
  saveQuranProgress,
  type DailyState,
} from "@/lib/storage";
import type { WardDay } from "@/lib/types";
import type { SearchIndex } from "@/lib/quran/search";

/** Stable empty index so `search` keeps a constant identity before the dataset loads. */
const EMPTY_INDEX: SearchIndex[] = [];

export type QuranData = {
  loaded: boolean;
  dataset: QuranDataset | null;
  /** Printed-mushaf pagination (null until ayah-meta.json loads). */
  meta: AyahMeta | null;
  hashes: string[];
  /**
   * Honest Quran-data outcome. `verified` means the SHA-256 gate accepted the
   * text; `offline` distinguishes "could not fetch" from a genuine failure so
   * the UI never tells a user their data is broken when it is merely unfetched.
   */
  datasetStatus: DatasetUiStatus;
  /**
   * True once the dataset load has actually settled. Deliberately separate from
   * `loaded`, which flips synchronously when the effect starts and therefore
   * says nothing about the dataset -- gating a failure notice on it would flash
   * a false error on every cold start.
   */
  datasetSettled: boolean;
  daily: DailyState | null;
  dailyReady: boolean;
  wardDay: WardDay | null;
  bookmarks: string[];
  getAyah: (ayahId: string) => ReturnType<typeof resolveAyah>;
  getRelated: (ayahId: string) => ReturnType<typeof getRelatedAyahs>;
  getTopics: (ayahId: string) => ReturnType<typeof getVerseTopics>;
  getTafsir: (ayahId: string) => TafsirEntry | null;
  search: (query: string, limit?: number) => QuranSearchResult[];
  isBookmarked: (ayahId: string) => boolean;
  toggleBookmark: (ayahId: string) => void;
  markAyahRead: () => void;
  completeTadabbur: () => void;
  deferTadabbur: () => void;
  /** Advance the Quran-side ward progress by N printed pages. */
  markPageRead: (countPages: number) => void;
  /** Mark the whole Quran-side ward read (advances to the next ward). */
  completeWard: () => void;
};

export function useQuran(args?: { dailyPages?: number; totalPages?: number }): QuranData {
  const dailyPages = Math.max(1, Math.floor(args?.dailyPages ?? 25));
  const totalPages = Math.max(1, Math.floor(args?.totalPages ?? 604));
  const [dataset, setDataset] = useState<QuranDataset | null>(null);
  const [meta, setMeta] = useState<AyahMeta | null>(null);
  const [progress, setProgress] = useState<WardProgress | null>(null);
  const [datasetStatus, setDatasetStatus] = useState<DatasetUiStatus>("error");
  const [datasetSettled, setDatasetSettled] = useState(false);
  const [hashes, setHashes] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [daily, setDaily] = useState<DailyState | null>(null);
  const [wardDay, setWardDay] = useState<WardDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState<string>(() => dateKeyOf(new Date()));

  /* --- Quran data loading -------------------------------------------
     `aliveRef` guards writes after unmount, and `statusRef` mirrors the dataset
     outcome because the wake listeners are registered once ([] deps) and must
     never close over a stale render. Attempt/staleness bookkeeping lives in
     the pure coordinator so its guarantees are testable. */
  const aliveRef = useRef(true);
  const statusRef = useRef<DatasetUiStatus>("error");
  /* Lazy useState initializer, not a ref: it runs once per hook instance and
     yields a permanently stable identity without reading `.current` during
     render, which the react-hooks rules forbid. */
  const [coordinator] = useState(createReloadCoordinator);

  const loadQuranData = useCallback(() => {
    /* A burst of focus/pageshow events collapses into one load rather than one
       per event. */
    const attempt = coordinator.start();
    if (!attempt) return;
    setDatasetSettled(false);

    /* One coordinated reload over three resources.

       `loadDatasetWithStatus` is wrapped, not replaced: it still runs the same
       SHA-256 gate and still returns dataset: null on a mismatch. It only adds
       the offline/error distinction the UI needs to stay honest.

       hashes.json and ayah-meta.json are fetched with NO IndexedDB cache (see
       store.ts), so a first launch while offline leaves them [] and null --
       and until this retry existed, permanently. ayah-meta is what gives the
       Mushaf reader real page/juz/quarter pagination: without it every page
       lookup returns null, the page index is hidden, and the page count falls
       back to a hardcoded 604. hashes back the per-ayah integrity badge in
       Ayah.tsx. All three therefore have to retry together.

       Deliberately NOT three independent .then() calls on `attempt`: hashes
       (~430KB) lands well before quran.json (>1MB), and each separate settle()
       would release the shared in-flight slot, so a plain tab switch during the
       load would start a second full download. runCoordinatedReload owns one
       aggregate settlement point instead. */
    void runCoordinatedReload(attempt, {
      dataset: loadDatasetWithStatus(),
      hashes: loadHashes(),
      meta: loadAyahMeta(),
      /* Read the mount guard at settlement time, never when the attempt was
         minted, so an unmount mid-load is still honoured. */
      accept: () => aliveRef.current,
      onSettled: () => {
        /* Every path -- including a rejected promise -- reaches this, which is
           what stops the notice from sitting on "loading" forever. */
        setDatasetSettled(true);
      },
    }).then((report) => {
      /* A superseded attempt must not touch current state at all. */
      if (!report.applied) return;

      const ds = report.dataset;
      /* A rejection can only mean the dataset never became verified, so it is
         reported as an error -- never as "still loading". */
      statusRef.current = ds.ok ? ds.value.status : "error";
      setDataset(ds.ok ? ds.value.dataset : null);
      setDatasetStatus(ds.ok ? ds.value.status : "error");
      if (report.hashes.ok) setHashes(report.hashes.value);
      if (report.meta.ok) setMeta(report.meta.value as AyahMeta | null);
    });
  }, [coordinator]);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe one-time loads from cache/localStorage */
  useEffect(() => {
    aliveRef.current = true;
    loadQuranData();
    setBookmarks(loadBookmarks());
    setDaily(loadDaily());
    setWardDay(loadWardDay());
    setLoaded(true);
    return () => {
      aliveRef.current = false;
      /* Invalidate anything still in flight so a late resolve cannot write to
         an unmounted hook, and free the slot for a remount. */
      coordinator.cancel();
    };
  }, [coordinator, loadQuranData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Retry when the world changes under us.
     `quran.dataOffline` promises the user, in both languages, that the Quran
     text "will appear once you reconnect". Nothing implemented that: the load
     effect had `[]` deps and no one called subscribeConnectivity, so a first
     launch offline -- or any transient fetch/hash failure -- pinned the
     failure notice until the app was killed and restarted.
     Same trigger set as the reminder and day rollover in useWardData: the
     network returning, plus the OS waking a backgrounded app (a phone that
     dropped Wi-Fi in a lift, or a tab restored from bfcache). */
  useEffect(() => {
    const refreshIfUnverified = () => {
      /* Verified already: nothing is broken, so there is nothing to fix. */
      if (!shouldReloadQuranData(statusRef.current)) return;
      loadQuranData();
    };

    const unsubscribe = subscribeConnectivity((online) => {
      if (online) refreshIfUnverified();
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfUnverified();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshIfUnverified);
    window.addEventListener("pageshow", refreshIfUnverified);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refreshIfUnverified);
      window.removeEventListener("pageshow", refreshIfUnverified);
    };
  }, [loadQuranData]);

  const todayKey = useCallback(() => dateKeyOf(new Date()), []);

  useEffect(() => {
    if (!loaded) return;

    const sync = () => {
      const next = todayKey();
      setToday((prev) => (prev === next ? prev : next));
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const armMidnightTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        sync();
        armMidnightTimer();
      }, msUntilNextMidnight());
    };
    const onWake = () => {
      sync();
      armMidnightTimer();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onWake();
    };

    armMidnightTimer();
    sync();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  /* eslint-disable react-hooks/set-state-in-effect -- persist deterministic daily selection + ward day once per day */
  useEffect(() => {
    if (!loaded || !dataset) return;
    const pool = tadabburPool(TAFSIR, dataset);
    const persisted = daily && daily.date === today ? daily : null;
    const recent = persisted ? persisted.recent : daily ? daily.recent : [];
    const selection = getDailyAyah(new Date(), dataset, pool, recent);
    if (!selection) return;

    if (!(persisted && persisted.ref === selection.ref)) {
      const nextRecent = [selection.ref, ...recent].filter((r) => r !== selection.ref).slice(0, 14);
      const nextDaily: DailyState = {
        ref: selection.ref,
        date: selection.dateKey,
        recent: nextRecent,
      };
      setDaily(nextDaily);
      saveDaily(nextDaily);
    }

    if (!wardDay || wardDay.date !== selection.dateKey || wardDay.ayahId !== selection.ref) {
      const next: WardDay = {
        date: selection.dateKey,
        ayahId: selection.ref,
        read: false,
        tadabburDone: false,
        deferred: false,
      };
      setWardDay(next);
      saveWardDay(next);
    }
  }, [loaded, dataset, daily, wardDay, today]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Quran-side ward progress (ayah-granular mirror used by the mushaf reader).
     Built once the dataset is ready, rolled over daily by the engine. */
  /* eslint-disable react-hooks/set-state-in-effect -- build persisted progress once dataset ready */
  useEffect(() => {
    if (!loaded || !dataset) return;

    const pool = tadabburPool(TAFSIR, dataset);
    const next = buildWardProgress({
      prev: progress ?? loadQuranProgress(),
      date: today,
      dailyPages,
      totalPages,
      dataset,
      pool,
    });
    setProgress((cur) => (cur === next ? cur : next));
    saveQuranProgress(next);
  }, [loaded, dataset, dailyPages, totalPages, progress, today]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const getAyah = useCallback(
    (ayahId: string) => (dataset ? resolveAyah(ayahId, dataset) : null),
    [dataset]
  );

  const getRelated = useCallback(
    (ayahId: string) => (dataset ? getRelatedAyahs(ayahId, RELATIONS, dataset) : null),
    [dataset]
  );

  const getTopics = useCallback((ayahId: string) => getVerseTopics(ayahId, TOPICS), []);

  const getTafsirRef = useCallback((ayahId: string) => getTafsir(ayahId, TAFSIR), []);

  /* The index normalizes all 6,236 verses, which was pure cold-start cost for
     a feature most sessions never touch. Build it on the first real search
     instead, and keep it until the dataset identity changes. */
  const searchIndexRef = useRef<{ dataset: QuranDataset | null; index: ReturnType<typeof buildSearchIndex> }>({
    dataset: null,
    index: EMPTY_INDEX,
  });

  const getSearchIndex = useCallback(() => {
    if (searchIndexRef.current.dataset !== dataset) {
      searchIndexRef.current = {
        dataset,
        index: dataset ? buildSearchIndex(dataset, TOPICS) : EMPTY_INDEX,
      };
    }
    return searchIndexRef.current.index;
  }, [dataset]);

  const search = useCallback(
    (query: string, limit?: number) => searchWithIndex(getSearchIndex(), query, limit),
    [getSearchIndex]
  );

  const isBookmarked = useCallback((ayahId: string) => bookmarks.includes(ayahId), [bookmarks]);

  const toggleBookmark = useCallback(
    (ayahId: string) => {
      setBookmarks((prev) => {
        const next = prev.includes(ayahId) ? prev.filter((r) => r !== ayahId) : [ayahId, ...prev];
        saveBookmarks(next);
        return next;
      });
    },
    []
  );

  const markAyahRead = useCallback(() => {
    setWardDay((prev) => {
      if (!prev) return prev;
      const next = { ...prev, read: true };
      saveWardDay(next);
      return next;
    });
  }, []);

  const completeTadabbur = useCallback(() => {
    setWardDay((prev) => {
      if (!prev) return prev;
      const next = { ...prev, read: true, tadabburDone: true, deferred: false };
      saveWardDay(next);
      return next;
    });
  }, []);

  const deferTadabbur = useCallback(() => {
    setWardDay((prev) => {
      if (!prev) return prev;
      const next = { ...prev, deferred: true };
      saveWardDay(next);
      return next;
    });
  }, []);

  const markPageRead = useCallback(
    (countPages: number) => {
      if (!dataset) return;
      const pool = tadabburPool(TAFSIR, dataset);
      setProgress((prev) => {
        if (!prev) return prev;
        const next = advancePages({
          state: prev,
          countAyahs: ayahQuotaForPages(dataset, countPages, totalPages),
          dataset,
          pool,
        });
        saveQuranProgress(next);
        return next;
      });
    },
    [dataset, totalPages]
  );

  const completeWard = useCallback(() => {
    if (!dataset) return;
    setProgress((prev) => {
      if (!prev) return prev;
      const next = finishWard({ state: prev, dataset });
      saveQuranProgress(next);
      return next;
    });
  }, [dataset]);

  const dailyReady = Boolean(dataset && daily && daily.date === dateKeyOf(new Date()));

  return useMemo(
    () => ({
      loaded,
      datasetStatus,
      datasetSettled,
      dataset,
      meta,
      hashes,
      daily,
      dailyReady,
      wardDay,
      bookmarks,
      getAyah,
      getRelated,
      getTopics,
      getTafsir: getTafsirRef,
      search,
      isBookmarked,
      toggleBookmark,
      markAyahRead,
      completeTadabbur,
      deferTadabbur,
      markPageRead,
      completeWard,
    }),
    [
      loaded,
      datasetStatus,
      datasetSettled,
      dataset,
      meta,
      hashes,
      daily,
      dailyReady,
      wardDay,
      bookmarks,
      getAyah,
      getRelated,
      getTopics,
      getTafsirRef,
      search,
      isBookmarked,
      toggleBookmark,
      markAyahRead,
      completeTadabbur,
      deferTadabbur,
      markPageRead,
      completeWard,
    ]
  );
}






import { msUntilNextMidnight } from "@/lib/dates";
