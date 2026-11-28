"use client";

import { BookOpen, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VerseText } from "@/components/quran";
import { useLocale } from "@/lib/locale";
import { asbabFor, loadAsbab } from "@/lib/quran/asbab";
import { globalIdOf, refFromGlobalId } from "@/lib/quran/progress";
import { resolveAyah } from "@/lib/quran/validate";
import type { QuranDataset } from "@/lib/quran/types";

type AsbabState = "loading" | "failed" | string[];

/**
 * The unified per-ayah tafsir base, shown for every verse below the main
 * interpretation: the verse's place in the mushaf (previous/next ayah) and
 * the occasion of revelation when one is established.
 *
 * Two honesty rules:
 *  - Neighbor verses come verbatim from the verified bundled dataset, never
 *    from any tafsir text.
 *  - When the Wahidi asbab pack has no entry for the ayah, the panel says so
 *    explicitly instead of guessing; when the pack itself failed to load, it
 *    says that instead of claiming "no occasion".
 */
export function TafsirFoundation({
  ayahRef,
  dataset,
  showAsbab,
}: {
  ayahRef: string;
  dataset: QuranDataset | null;
  showAsbab: boolean;
}) {
  const { t } = useLocale();
  const [asbab, setAsbab] = useState<AsbabState>("loading");

  useEffect(() => {
    if (!showAsbab) return;
    let alive = true;
    loadAsbab().then((data) => {
      if (!alive) return;
      setAsbab(data ? asbabFor(data, ayahRef) : "failed");
    });
    return () => {
      alive = false;
    };
  }, [ayahRef, showAsbab]);

  const neighbors = useMemo(() => {
    if (!dataset) return null;
    const id = globalIdOf(dataset, ayahRef);
    if (!id) return null;
    const prevRef = id > 1 ? refFromGlobalId(dataset, id - 1) : null;
    const nextRef = id < dataset.manifest.totalAyahs ? refFromGlobalId(dataset, id + 1) : null;
    const textOf = (ref: string | null): string | null =>
      ref ? resolveAyah(ref, dataset)?.verse.text ?? null : null;
    return {
      prev: prevRef ? { ref: prevRef, text: textOf(prevRef) } : null,
      next: nextRef ? { ref: nextRef, text: textOf(nextRef) } : null,
    };
  }, [dataset, ayahRef]);

  const occasions = Array.isArray(asbab) ? asbab : [];
  const showAsbabBlock = showAsbab && asbab !== "loading";
  const showContext = Boolean(neighbors && (neighbors.prev || neighbors.next));

  if (!showContext && !showAsbabBlock) return null;

  return (
    <div className="flex flex-col gap-3">
      {showContext && neighbors && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <BookOpen size={14} className="text-primary" />
            <h4 className="text-xs font-black">{t("tafsir.foundation.context")}</h4>
          </div>
          <div className="flex flex-col gap-2">
            {neighbors.prev && neighbors.prev.text && (
              <NeighborCard
                label={t("tafsir.foundation.prev")}
                refLabel={neighbors.prev.ref}
                text={neighbors.prev.text}
              />
            )}
            {neighbors.next && neighbors.next.text && (
              <NeighborCard
                label={t("tafsir.foundation.next")}
                refLabel={neighbors.next.ref}
                text={neighbors.next.text}
              />
            )}
          </div>
        </section>
      )}

      {showAsbabBlock && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Info size={14} className="text-primary" />
            <h4 className="text-xs font-black">{t("tafsir.section.revelation")}</h4>
          </div>
          {asbab === "failed" ? (
            <p className="text-[11px] leading-6 text-muted">
              {t("tafsir.foundation.asbabFailed")}
            </p>
          ) : occasions.length === 0 ? (
            <p className="text-[11px] leading-6 text-muted">{t("tafsir.revelation.none")}</p>
          ) : (
            <div className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="flex flex-col gap-2">
                {occasions.map((occasion, i) => (
                  <p key={i} className="text-[12px] leading-7 text-ink">
                    {occasion}
                  </p>
                ))}
              </div>
              <p className="mt-2 border-t border-line pt-2 text-[10px] leading-5 text-muted">
                {t("tafsir.foundation.asbabSource")}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function NeighborCard({
  label,
  refLabel,
  text,
}: {
  label: string;
  refLabel: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="mb-1 text-[10px] font-bold text-muted">
        {label} · <bdi dir="ltr">{refLabel}</bdi>
      </p>
      <VerseText text={text} className="text-sm leading-8 line-clamp-3" />
    </div>
  );
}
