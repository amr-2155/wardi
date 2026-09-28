"use client";

import { Check, ChevronRight, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui";
import type { DhikrItem } from "@/data/adhkar";
import { bumpDhikrCount } from "@/lib/adhkarStore";
import { todayKey } from "@/lib/dates";
import { useLocale } from "@/lib/locale";

export function DhikrReciter({
  title,
  items,
  onExit,
}: {
  title: string;
  items: DhikrItem[];
  onExit: () => void;
}) {
  const { t } = useLocale();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const today = todayKey();

  const item = items[index];
  const isLast = index === items.length - 1;

  const advance = useCallback(() => {
    if (leaving || !item) return;
    bumpDhikrCount(item.id, today, item.count ?? 1);
    if (isLast) {
      setFinished(true);
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setLeaving(false);
      setIndex((i) => i + 1);
    }, 300);
  }, [item, isLast, leaving, today]);

  if (finished) {
    return <DoneScreen title={title} onExit={onExit} />;
  }

  const pct = (index / items.length) * 100;
  const counter = t("adhkar.progress", { current: String(index + 1), total: String(items.length) });

  return (
    <div className="mt-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          aria-label={t("adhkar.exit")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted transition active:scale-90"
        >
          <X size={16} />
        </button>
        <span className="text-xs font-black text-muted tabular-nums">{counter}</span>
      </div>

      {/* progress */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-l from-gold to-gold-strong transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* page card */}
      <div className="mt-4 [perspective:1200px]">
        <div
          key={item.id}
          className={leaving ? "animate-dhikr-leave" : "animate-dhikr-arrive"}
        >
          <Card className="p-5">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-black text-gold-strong">
                {item.type === "quran" ? t("adhkar.quran") : t("adhkar.sunnah")}
              </span>
              {item.count && item.count > 1 && (
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black text-muted">
                  ×{item.count}
                </span>
              )}
              <span className="ms-auto rounded-full bg-gold-soft px-2.5 py-0.5 text-[11px] font-black text-gold-strong">
                {t(`adhkar.authenticity.${item.authenticity}`)}
              </span>
            </div>

            <p
              className={`mt-4 break-words whitespace-pre-line ${
                item.type === "quran"
                  ? "font-quran font-normal text-lg leading-[2.2] text-primary-ink"
                  : "text-base font-bold leading-9 text-ink"
              }`}
            >
              {item.text}
            </p>

            {item.note && (
              <p className="mt-3 break-words border-t border-line pt-3 text-xs leading-6 text-muted">{item.note}</p>
            )}

            <p className="mt-2 break-words text-[11px] text-muted">{item.source}</p>
          </Card>
        </div>
      </div>

      <p className="mt-4 text-center text-xs font-bold text-muted">{t("adhkar.tapHint")}</p>

      <button
        type="button"
        onClick={advance}
        className="mx-auto mt-3 flex h-14 w-40 items-center justify-center gap-2 rounded-3xl bg-gold text-base font-black text-primary-deep shadow-lg shadow-gold/20 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Check size={20} strokeWidth={3} />
        {isLast ? t("adhkar.finish") : t("adhkar.done")}
      </button>
    </div>
  );
}

function DoneScreen({ title, onExit }: { title: string; onExit: () => void }) {
  const { t } = useLocale();
  return (
    <div className="mt-10 flex flex-col items-center text-center animate-scale-in">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gold text-primary-deep shadow-lg shadow-gold/25">
        <Check size={38} strokeWidth={3} />
      </span>
      <h2 className="mt-5 text-xl font-black text-ink">{title}</h2>
      <p className="mt-2 text-lg font-black text-gold-strong">{t("adhkar.sessionDone")}</p>
      <p className="mt-2 max-w-62 text-sm font-bold leading-6 text-muted">{t("adhkar.sessionDoneHint")}</p>
      <button
        type="button"
        onClick={onExit}
         className="mt-8 flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-gold px-6 text-sm font-black text-primary-deep transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronRight size={16} />
        {t("adhkar.backToList")}
      </button>
    </div>
  );
}