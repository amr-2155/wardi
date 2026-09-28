"use client";

import { Check, X } from "lucide-react";
import { useEffect } from "react";
import { useLocale } from "@/lib/locale";
import { useAudioPlayer } from "@/components/providers/AudioProvider";

/**
 * ReciterSheet — shared reciter picker for the mushaf readers.
 * Lists loaded reciters (loads them on first open), marks the current
 * one, and selects on tap. Network errors show a retry action.
 */
export function ReciterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useLocale();
  const audio = useAudioPlayer();

  useEffect(() => {
    if (
      open &&
      audio.reciters.length === 0 &&
      !audio.recitersLoading &&
      !audio.error
    ) {
      void audio.actions.loadReciters();
    }
  }, [open, audio.reciters.length, audio.recitersLoading, audio.error, audio.actions]);

  if (!open) return null;

  const selectedId = audio.currentReciter?.id ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="animate-sheet-up flex max-h-[72dvh] w-full max-w-3xl flex-col rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
        onClick={(e) => e.stopPropagation()}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-black">{t("mushaf.pickReciter")}</p>
            {selectedId && audio.currentReciter && (
              <p className="mt-0.5 text-xs font-bold text-muted">
                {audio.currentReciter.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ui.close")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
          {audio.recitersLoading && audio.reciters.length === 0 ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-2xl border border-line bg-surface"
                />
              ))}
            </div>
          ) : audio.error && audio.reciters.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-muted">{audio.error}</p>
              <button
                type="button"
                onClick={() => void audio.actions.loadReciters()}
                className="mt-4 h-11 rounded-2xl bg-gold px-6 text-sm font-black text-primary-deep transition active:scale-[0.98]"
              >
                {t("audio.retry")}
              </button>
            </div>
          ) : audio.reciters.length === 0 ? (
            <p className="py-10 text-center text-sm font-bold text-muted">
              {t("audio.noReciters")}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {audio.reciters.map((r) => {
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      void audio.actions.selectReciter(r.id).then(() => onClose());
                    }}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-right transition active:scale-[0.99] ${
                      active ? "bg-gold-soft ring-1 ring-gold/40" : "hover:bg-surface-soft"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{r.name}</span>
                      <span className="block truncate text-[11px] font-bold text-muted">
                        {r.englishName}
                      </span>
                    </span>
                    {active && <Check size={16} className="shrink-0 text-gold-strong" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
