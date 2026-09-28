"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RELATIONS, TOPICS, TAFSIR } from "@/data/quran";
import type { AyahMeta, QuranDataset, QuranSearchResult, TafsirEntry, WardProgress } from "@/lib/quran/types";
import { getRelatedAyahs } from "@/lib/quran/relations";
import { getTafsir, tadabburPool } from "@/lib/quran/tafsir";
import { getDailyAyah, dateKeyOf } from "@/lib/quran/daily";
import { searchWithIndex, buildSearchIndex, getVerseTopics } from "@/lib/quran/search";
import { loadAyahMeta, loadDataset, loadHashes, type DatasetStatus } from "@/lib/quran/store";
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
  status: DatasetStatus;
  dataset: QuranDataset | null;
  /** Printed-mushaf pagination (null until ayah-meta.json loads). */
  meta: AyahMeta | null;
  hashes: string[];
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
  const [status, setStatus] = useState<DatasetStatus>("error");
  const [hashes, setHashes] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [daily, setDaily] = useState<DailyState | null>(null);
  const [wardDay, setWardDay] = useState<WardDay | null>(null);
  const [loaded, setLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe one-time loads from cache/localStorage */
  useEffect(() => {
    let cancelled = false;
    loadDataset().then((result) => {
      if (cancelled) return;
      setDataset(result.dataset);
      setStatus(result.status);
    });
    loadHashes().then((h) => {
      if (!cancelled) setHashes(h);
    });
    loadAyahMeta().then((m) => {
      if (!cancelled) setMeta(m);
    });
    setBookmarks(loadBookmarks());
    setDaily(loadDaily());
    setWardDay(loadWardDay());
    setLoaded(true);
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- persist deterministic daily selection + ward day once per day */
  useEffect(() => {
    if (!loaded || !dataset) return;
    const today = dateKeyOf(new Date());
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
  }, [loaded, dataset, daily, wardDay]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Quran-side ward progress (ayah-granular mirror used by the mushaf reader).
     Built once the dataset is ready, rolled over daily by the engine. */
  /* eslint-disable react-hooks/set-state-in-effect -- build persisted progress once dataset ready */
  useEffect(() => {
    if (!loaded || !dataset) return;
    const today = dateKeyOf(new Date());
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
  }, [loaded, dataset, dailyPages, totalPages, progress]);
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

  /* Pre-normalize the dataset once. `dataset` is stable state (set on load),
     so this runs exactly once per dataset instead of per keystroke. */
  const searchIndex = useMemo(
    () => (dataset ? buildSearchIndex(dataset, TOPICS) : EMPTY_INDEX),
    [dataset]
  );

  const search = useCallback(
    (query: string, limit?: number) => searchWithIndex(searchIndex, query, limit),
    [searchIndex]
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
      status,
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
      status,
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
