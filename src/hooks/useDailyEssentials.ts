"use client";

import { useCallback, useEffect, useState } from "react";
import { DHIKR_ITEMS } from "@/data/adhkar";
import { loadAdhkarCounts, loadNiyyahItems } from "@/lib/adhkarStore";
import { todayKey } from "@/lib/dates";

export type EssentialsSummary = {
  /** Adhkar fully recited today, and the total across every category. */
  adhkarDone: number;
  adhkarTotal: number;
  adhkarComplete: boolean;
  /** How many intentions the user has written down. */
  niyyahCount: number;
  loaded: boolean;
};

/**
 * Read-only progress for the home feature cards.
 *
 * Kept out of the card row itself so Home stays presentational and the counts
 * are computed once from the same store the adhkar and niyyah screens write to
 * — so a card can never disagree with the screen it opens.
 */
export function useDailyEssentials(): EssentialsSummary {
  const [summary, setSummary] = useState<EssentialsSummary>({
    adhkarDone: 0,
    adhkarTotal: DHIKR_ITEMS.length,
    adhkarComplete: false,
    niyyahCount: 0,
    loaded: false,
  });

  const refresh = useCallback(() => {
    const today = todayKey();
    const counts = loadAdhkarCounts();
    /* Counts carry the day they were written on, so yesterday's stored total
       must read as zero rather than carry into today. */
    const isToday = !!counts && counts.date === today;
    let done = 0;
    for (const item of DHIKR_ITEMS) {
      const target = item.count ?? 1;
      const current = isToday ? Math.min(counts.items[item.id] ?? 0, target) : 0;
      if (current >= target) done += 1;
    }
    setSummary({
      adhkarDone: done,
      adhkarTotal: DHIKR_ITEMS.length,
      adhkarComplete: done === DHIKR_ITEMS.length && DHIKR_ITEMS.length > 0,
      niyyahCount: loadNiyyahItems().length,
      loaded: true,
    });
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe read of localStorage */
  useEffect(() => {
    refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return summary;
}
