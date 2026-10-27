"use client";

import { BookHeart, Check, Gift, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { loadDedications, saveDedication, type DedicationMap } from "@/lib/dedications";
import { ProgressRing } from "@/components/ProgressRing";
import { Card } from "@/components/ui";
import { formatLocaleShort, useLocale } from "@/lib/locale";
import type { WardData } from "@/hooks/useWardData";

export function KhatmaView({ data }: { data: WardData }) {
  const { t, locale } = useLocale();
  const finished = new Map<number, { date: string; pages: number }>();
  for (const reading of data.history) {
    if (reading.completed && reading.endPage >= data.settings.totalPages) {
      if (!finished.has(reading.khatma)) {
        finished.set(reading.khatma, { date: reading.date, pages: reading.pages });
      }
    }
  }
  const completedList = [...finished.entries()].sort((a, b) => a[0] - b[0]);
  const khatmaRemaining = data.settings.totalPages - data.startPage + 1;

  /* Heat-map coverage for the CURRENT khatma: union of this khatma's recorded
     ranges. Today's ward range is overlaid, everything else stays honest. */
  const total = Math.max(1, data.settings.totalPages);
  const covered = useMemo(() => {
    const set = new Set<number>();
    for (const r of data.history) {
      if (r.khatma !== data.settings.khatmaNumber) continue;
      const from = Math.max(1, Math.min(r.startPage, r.endPage));
      const to = Math.min(total, Math.max(r.startPage, r.endPage));
      for (let p = from; p <= to; p += 1) set.add(p);
    }
    return set;
  }, [data.history, data.settings.khatmaNumber, total]);
  const wardFrom = Math.max(1, data.startPage);
  const wardTo = Math.min(total, data.endPage);

  /* Reward dedications per finished khatma. Local form state only tracks
     which card is being gifted right now. */
  const [dedications, setDedications] = useState<DedicationMap>(() => loadDedications());
  const [gifting, setGifting] = useState<number | null>(null);
  const [giftName, setGiftName] = useState("");

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 pt-6">
      <h2 className="text-2xl font-black">{t("khatma.title")}</h2>
      <p className="mt-1 text-[11px] text-muted">
        {completedList.length > 0
          ? t("khatma.doneCount", { n: completedList.length })
          : t("khatma.startFirst")}
      </p>

      {/* CURRENT KHATMA */}
      <section className="relative mt-4 overflow-hidden rounded-[28px] bg-primary p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -end-14 -top-14 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <ProgressRing
            percent={data.khatmaPercent}
            size={104}
            stroke={8}
            track="rgba(255,255,255,0.15)"
            bar="var(--gold)"
            className="shrink-0"
            label={
              <span className="text-xl font-black text-white">{data.khatmaPercent}%</span>
            }
          />
          <div>
            <p className="text-[11px] text-white/60">{t("khatma.current")}</p>
            <p className="text-3xl font-black">
              {t("khatma.currentN", { n: data.settings.khatmaNumber })}
            </p>
            <p className="mt-1 text-[11px] text-white/70">
              {t("khatma.pageOf", {
                from: data.startPage,
                to: data.settings.totalPages,
              })}
            </p>
            <p className="mt-0.5 text-[11px] text-gold">
              {t("khatma.remaining", { n: khatmaRemaining })}
            </p>
          </div>
        </div>
      </section>

      {/* KHATMA MAP — one cell per page, coloured from real history. Cells
          are decorative; the summary line carries the same fact as text. */}
      <section className="mt-4 rounded-[26px] border border-line bg-surface p-4 shadow-sm">
        <div className="mb-1 flex items-center justify-between px-1">
          <p className="text-[11px] font-black text-muted">{t("khatma.mapTitle")}</p>
          <p className="text-[10px] font-bold text-muted">
            {t("khatma.mapSummary", { done: covered.size, total })}
          </p>
        </div>
        <div className="grid grid-cols-[repeat(38,minmax(0,1fr))] gap-[3px]" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => {
            const page = i + 1;
            const inWard = page >= wardFrom && page <= wardTo;
            const read = covered.has(page);
            return (
              <span
                key={page}
                className={`aspect-square rounded-[2px] ${
                  inWard
                    ? "bg-primary ring-1 ring-primary"
                    : read
                      ? "bg-gold"
                      : "bg-surface-2"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center gap-4 px-1 text-[10px] font-bold text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-gold" />
            {t("khatma.mapRead")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
            {t("khatma.mapToday")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-2 ring-1 ring-line" />
            {t("khatma.mapUnread")}
          </span>
        </div>
      </section>

      {/* START NEW */}
      <button
        type="button"
        onClick={data.startNewKhatma}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-white transition active:scale-[0.98]"
      >
        <Plus size={18} />
        {t("khatma.startNew")}
      </button>

      {/* COMPLETED LIST */}
      <div className="mb-2 mt-5 flex items-center gap-1.5">
        <BookHeart size={15} className="text-gold-strong" />
        <p className="text-[11px] font-bold text-muted">{t("khatma.completedList")}</p>
      </div>

      {completedList.length === 0 ? (
        <Card className="p-8 text-center">
          <Sparkles size={28} className="mx-auto mb-3 text-gold-strong" />
          <p className="text-sm font-bold">{t("khatma.noCompleted")}</p>
          <p className="mt-1 text-[11px] text-muted">{t("khatma.keepGoing")}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {completedList.map(([khatma, info]) => {
            const dedication = dedications[String(khatma)];
            const isGifting = gifting === khatma;
            return (
              <Card key={khatma} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success">
                    <Check size={20} strokeWidth={3} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black">{t("khatma.completedN", { n: khatma })}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatLocaleShort(locale, info.date)} ·{" "}
                      {t("khatma.completedIn", { n: info.pages })}
                    </p>
                  </div>
                  <span className="rounded-full bg-gold-soft px-3 py-1 text-[10px] font-bold text-gold-strong">
                    {t("khatma.mashallah")}
                  </span>
                </div>
                {dedication ? (
                  <p className="mt-2.5 flex items-center gap-1.5 rounded-2xl bg-gold-soft/60 px-3 py-2 text-[11px] font-black text-gold-strong">
                    <Gift size={13} className="shrink-0" />
                    {t("khatma.dedicatedTo", { name: dedication.name })}
                  </p>
                ) : isGifting ? (
                  <div className="mt-2.5 flex gap-2 animate-fade-up">
                    <input
                      value={giftName}
                      onChange={(e) => setGiftName(e.target.value)}
                      placeholder={t("khatma.dedicatePh")}
                      maxLength={60}
                      aria-label={t("khatma.dedicatePh")}
                      className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-xs font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      disabled={!giftName.trim()}
                      onClick={() => {
                        setDedications(saveDedication(khatma, giftName));
                        setGifting(null);
                        setGiftName("");
                      }}
                      className="h-10 shrink-0 rounded-xl bg-gold px-4 text-xs font-black text-primary-deep transition active:scale-95 disabled:opacity-40"
                    >
                      {t("khatma.dedicateSave")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setGifting(khatma);
                      setGiftName("");
                    }}
                    className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[11px] font-bold text-muted transition active:scale-[0.98]"
                  >
                    <Gift size={13} />
                    {t("khatma.dedicate")}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
