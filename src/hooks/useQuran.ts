"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RELATIONS, TOPICS, TAFSIR } from "@/data/quran";
import type { QuranDataset, QuranSearchResult, TafsirEntry } from "@/lib/quran/types";
import { getRelatedAyahs } from "@/lib/quran/relations";
import { getTafsir, tadabburPool } from "@/lib/quran/tafsir";
import { getDailyAyah, dateKeyOf } from "@/lib/quran/daily";
import { searchQuran, getVerseTopics } from "@/lib/quran/search";
import { loadDataset, loadHashes, type DatasetStatus } from "@/lib/quran/store";
import { resolveAyah } from "@/lib/quran/validate";
import {
  loadDaily,
  saveDaily,
  loadBookmarks,
  saveBookmarks,
  loadWardDay,
  saveWardDay,
  type DailyState,
} from "@/lib/storage";
import type { WardDay } from "@/lib/types";

export type QuranData = {
  loaded: boolean;
  status: DatasetStatus;
  dataset: QuranDataset | null;
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
};

export function useQuran(): QuranData {
  const [dataset, setDataset] = useState<QuranDataset | null>(null);
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

  const search = useCallback(
    (query: string, limit?: number) => (dataset ? searchQuran(query, dataset, TOPICS, limit) : []),
    [dataset]
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

  const dailyReady = Boolean(dataset && daily && daily.date === dateKeyOf(new Date()));

  return useMemo(
    () => ({
      loaded,
      status,
      dataset,
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
    }),
    [
      loaded,
      status,
      dataset,
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
    ]
  );
}
