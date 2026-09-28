"use client";

import { BookMarked, BookOpen } from "lucide-react";
import { useLocale } from "@/lib/locale";

export type ReaderMode = "quran" | "ward";

export function SegmentedControl({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: ReaderMode;
  onChange: (mode: ReaderMode) => void;
  "aria-label"?: string;
}) {
  const { t } = useLocale();
  const isQuran = value === "quran";

  return (
    <div
      className="mb-3 flex items-center gap-1 rounded-2xl bg-surface-2 p-1.5 ring-1 ring-line"
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    >
      <button
        type="button"
        onClick={() => onChange("quran")}
        aria-pressed={isQuran}
        className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          isQuran
            ? "bg-primary text-white shadow"
            : "text-muted hover:text-ink"
        }`}
      >
        <BookOpen size={15} />
        <span className="hidden sm:inline">{t("mushaf.quranMode")}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("ward")}
        aria-pressed={!isQuran}
        className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          !isQuran
            ? "bg-primary text-white shadow"
            : "text-muted hover:text-ink"
        }`}
      >
        <BookMarked size={15} />
        <span className="hidden sm:inline">{t("mushaf.wardMode")}</span>
      </button>
    </div>
  );
}
