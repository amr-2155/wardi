"use client";

import { CloudOff, FileWarning, Loader2, TriangleAlert } from "lucide-react";
import { useLocale } from "@/lib/locale";
import type { DatasetUiStatus } from "@/lib/quran/dataset-status";
import type { QuranData } from "@/hooks/useQuran";

/**
 * Maps a dataset outcome to the key that explains it, or null when there is
 * nothing to explain.
 *
 * Two rules are load-bearing:
 *  - `verified` never maps to a key. Hash-verified text is the healthy path,
 *    including a cache hit while offline, so it must stay silent.
 *  - `!settled` never maps to a key either. `quran.loaded` flips synchronously
 *    when the load effect starts, so gating on it flashes a false error on
 *    every cold start. Only a settled non-verified outcome may speak.
 *
 * Pure and exported so the mapping is testable without a DOM.
 */
export function datasetNoticeKey(
  status: DatasetUiStatus | null,
  settled: boolean
): string | null {
  if (!settled) return null;
  switch (status) {
    case "offline":
      return "quran.dataOffline";
    case "hash-mismatch":
      return "quran.dataMismatch";
    case "error":
      return "quran.dataError";
    default:
      return null;
  }
}

const ICONS = {
  "quran.dataOffline": CloudOff,
  "quran.dataMismatch": FileWarning,
  "quran.dataError": TriangleAlert,
} as const;

/**
 * The one honest place the app explains missing Quran text. Rendered where
 * Quran content is expected, so the absence of a verse reads as a data problem
 * rather than as "no results" or "verse not found".
 */
export function DatasetNotice({ quran }: { quran: QuranData }) {
  const { t } = useLocale();

  if (!quran.datasetSettled && quran.dataset === null) {
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-6 text-xs font-bold text-muted">
        <Loader2 size={14} className="animate-spin" />
        {t("tadabbur.loading")}
      </div>
    );
  }

  const key = datasetNoticeKey(quran.datasetStatus, quran.datasetSettled);
  if (!key) return null;
  const Icon = ICONS[key as keyof typeof ICONS];

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl border border-gold/30 bg-gold-soft/40 px-4 py-3 text-start"
    >
      <Icon size={15} className="mt-0.5 shrink-0 text-gold-strong" />
      <p className="text-xs font-bold leading-5 text-ink">{t(key)}</p>
    </div>
  );
}
