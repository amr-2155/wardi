"use client";

import { Check, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { ProgressRing } from "@/components/ProgressRing";
import { Card, ScreenHeader } from "@/components/ui";
import { formatLocaleDate, useLocale } from "@/lib/locale";
import { celebrateKhatma, celebrateWard } from "@/lib/haptics";
import type { WardData } from "@/hooks/useWardData";

export function ReadingModeView({
  data,
  onBack,
}: {
  data: WardData;
  onBack: () => void;
}) {
  const { t, locale } = useLocale();
  const currentPage = data.startPage + data.todayProgress;
  const [customPage, setCustomPage] = useState(currentPage);
  const [syncedPage, setSyncedPage] = useState(currentPage);

  /* The +/- buttons and any outside change move `todayProgress`, which left the
     manual field frozen at its mount value: pressing +5 then Save silently
     rewrote the pre-+5 number. Re-sync whenever the derived position moves.
     Typing does not change `currentPage`, so the field is not fought over while
     it is being edited. Adjusting during render (React's documented pattern for
     state derived from a prop) rather than in an effect, so it re-renders
     before committing instead of cascading. */
  if (currentPage !== syncedPage) {
    setSyncedPage(currentPage);
    setCustomPage(currentPage);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-5">
      <ScreenHeader title={t("mushaf.readingMode")} subtitle={t("reading.modeSub")} onBack={onBack} />

      <div className="mt-5 animate-fade-up">
        {/* CURRENT WARD */}
        <section className="relative overflow-hidden rounded-[28px] bg-primary p-6 text-white shadow-xl">
          <div className="pointer-events-none absolute -end-14 -top-14 h-44 w-44 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] text-white/60">{t("home.ward")}</p>
              <p className="text-3xl font-black">
                {data.todayPages}
                <span className="ms-1 text-xs font-bold text-white/70">{t("home.page")}</span>
              </p>
            </div>
            <p className="text-[11px] text-white/60">{formatLocaleDate(locale, data.today)}</p>
          </div>
          <div className="relative flex items-center justify-between py-6">
            <div className="text-center">
              <p className="text-[11px] text-white/60">{t("mushaf.wardFrom")}</p>
              <p className="text-5xl font-black leading-none">{data.startPage}</p>
            </div>
            <ChevronLeft size={28} className="text-white/50" />
            <div className="text-center">
              <p className="text-[11px] text-white/60">{t("mushaf.wardTo")}</p>
              <p className="text-5xl font-black leading-none">{data.endPage}</p>
            </div>
          </div>
          <div className="relative flex items-center gap-4">
            <ProgressRing
              percent={data.todayPercent}
              size={72}
              stroke={6}
              track="rgba(255,255,255,0.15)"
              bar="var(--gold)"
              label={
                <span className="text-[11px] font-black text-white">
                  {data.todayPercent}%
                </span>
              }
            />
            {/* `todayPages`, not `dailyPages`: the plan is truncated at the end
                of the mushaf and `todayPercent` is measured against it, so the
                plan size showed "5 of 25" beside a ring at 100% on the final
                khatma day. Keep the note out of the params object: the
                placeholder audit parses it by splitting on commas. */}
            <p className="text-sm font-bold text-white/90">
              {t("reading.progressOf", {
                done: data.todayProgress,
                total: data.todayPages,
              })}
              {data.todayProgress > 0 && (
                <span className="block text-[11px] font-normal text-white/60">
                  {t("reading.nowAt", { n: currentPage })}
                </span>
              )}
            </p>
          </div>
        </section>

        {data.isDone ? (
          <div className="mt-5 animate-scale-in rounded-3xl border border-success/30 bg-success-soft p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
              <Check size={26} strokeWidth={3} />
            </div>
            <p className="mt-3 text-lg font-black">{t("reading.doneMsg")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("reading.tomorrow", {
                from: data.tomorrowStart,
                to: data.tomorrowEnd,
                n: data.tomorrowPages,
              })}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-5 h-12 w-full rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[0.98]"
            >
              {t("reading.backHome")}
            </button>
          </div>
        ) : (
          <>
            {/* CONTROLS */}
            <Card className="mt-4 p-4">
              <p className="mb-3 text-sm font-bold">{t("reading.trackTitle")}</p>
              <div className="grid grid-cols-4 gap-2">
                {/* At zero, decrementing deletes today's history entry outright.
                    Disable it rather than letting one stray tap discard the
                    day's partial record with no confirmation. */}
                <ReadingBtn
                  delta={-1}
                  onClick={() => data.changeProgress(-1)}
                  disabled={data.todayProgress === 0}
                />
                <ReadingBtn delta={1} onClick={() => data.changeProgress(1)} />
                <ReadingBtn delta={2} onClick={() => data.changeProgress(2)} />
                <ReadingBtn delta={5} onClick={() => data.changeProgress(5)} />
              </div>
            </Card>

            {/* MANUAL */}
            <Card className="mt-3 p-4">
              <label className="mb-1.5 block text-[11px] font-bold text-muted">
                {t("reading.manualLabel")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={data.startPage}
                  max={data.endPage}
                  value={customPage}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    /* A cleared or non-numeric field is not a page number.
                       Propagating NaN made the field read "NaN" while the save
                       was silently dropped by the finite guard downstream. */
                    if (!Number.isFinite(raw)) {
                      setCustomPage(data.startPage);
                      return;
                    }
                    setCustomPage(raw);
                  }}
                  className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-lg font-black outline-none transition focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = Math.min(data.endPage, Math.max(data.startPage, customPage));
                    setCustomPage(value);
                    data.setProgressValue(value - data.startPage);
                  }}
                  className="h-12 shrink-0 rounded-2xl bg-primary px-4 text-sm font-black text-white transition active:scale-95"
                >
                  {t("home.sheet.save")}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {t("reading.allowedRange", {
                  from: data.startPage,
                  to: data.endPage,
                })}
              </p>
            </Card>

            {/* COMPLETE */}
            <button
              type="button"
              onClick={() => {
                const closedKhatma = data.endPage >= data.settings.totalPages;
                data.completeToday();
                if (closedKhatma) celebrateKhatma();
                else celebrateWard();
                onBack();
              }}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-lg font-black text-primary-deep shadow-lg transition active:scale-[0.98]"
            >
              <Check size={20} strokeWidth={3} />
              {t("home.finishToday")}
            </button>
            <p className="mt-3 text-center text-[11px] text-muted">
              {t("reading.onCompleteNote")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ReadingBtn({
  delta,
  onClick,
  disabled = false,
}: {
  delta: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 items-center justify-center gap-0.5 rounded-2xl text-sm font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
        delta > 0 ? "bg-primary text-white" : "bg-surface-2 text-muted"
      }`}
    >
      {delta > 0 ? "+" : "−"}
      {Math.abs(delta)}
    </button>
  );
}
