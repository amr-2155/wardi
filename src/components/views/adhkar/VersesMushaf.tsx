"use client";

import { useMemo } from "react";
import { useLocale } from "@/lib/locale";
import { parseMushafParts } from "@/lib/mushafText";

/**
 * Mushaf-style rendering for the Quran passages inside the adhkar.
 *
 * The dataset stores each passage inline, with "(1)" / "(2)" marking the end
 * of a verse. The old renderer put every verse on its own line beside a badge,
 * which reads like a table. A mushaf instead flows continuously and closes each
 * verse with a small medallion holding its number, so that is what this does.
 *
 * The splitting itself lives in `@/lib/mushafText` so it can be tested without
 * a renderer.
 */
export function VersesMushaf({
  text,
  size = "md",
}: {
  text: string;
  /** "sm" for the card list, "md" for the recite screen. */
  size?: "sm" | "md";
}) {
  const { locale } = useLocale();
  const parts = useMemo(() => parseMushafParts(text), [text]);
  const digits = useMemo(
    () => new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en"),
    [locale]
  );

  return (
    <p
      dir="rtl"
      lang="ar"
      className={`break-words text-ink ${size === "sm" ? "text-dhikr" : "text-dhikr text-dhikr-quran"} text-justify leading-[2.35]`}
    >
      {parts.map((part, i) =>
        part.kind === "ayah" ? (
          <span key={`a-${i}`}>
            {/* A non-breaking space glues the medallion to the last word of its
                verse, so a number can never wrap alone onto the next line —
                the orphaned "(4)" line the old renderer produced. */}
            {"\u00A0"}
            <span className="mx-1 inline-flex h-[1.6em] w-[1.6em] items-center justify-center rounded-full border border-gold/60 bg-gold-soft align-middle font-sans text-[0.52em] font-black leading-none tabular-nums text-gold-strong">
              {digits.format(part.n)}
            </span>
          </span>
        ) : (
          <span key={`w-${i}`}>{" "}{part.text}</span>
        )
      )}
    </p>
  );
}
