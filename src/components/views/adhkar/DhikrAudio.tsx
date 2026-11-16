"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useState } from "react";
import type { DhikrItem } from "@/data/adhkar";
import {
  adhkarReciters,
  canPlayDhikr,
  loadAdhkarReciter,
  saveAdhkarReciter,
  toggleDhikrAudio,
  useAdhkarAudio,
} from "@/lib/adhkarAudio";
import { useLocale } from "@/lib/locale";

/**
 * The adhkar player.
 *
 * `full` is the recite page: the reciter picker (Quran cards only) and the
 * play/pause control, with a plain sentence saying what is happening.
 * `compact` is the small control on each card in the list, where the reciter
 * name would crowd the dhikr itself.
 *
 * Every recording is a real recitation: a Quran verse read by the chosen
 * Quran.com reciter, or the dhikr's own Hisn al-Muslim recording. A card with
 * no verified recording has no control at all — there is no machine fallback.
 *
 * The state comes from a single module-level player, so a card and the recite
 * page can never both claim to be playing, and only one recording is audible.
 */
export function DhikrAudio({
  item,
  variant = "full",
}: {
  item: DhikrItem;
  variant?: "full" | "compact";
}) {
  const { locale, t } = useLocale();
  const audio = useAdhkarAudio();
  const [reciter, setReciter] = useState(() => loadAdhkarReciter());

  /* No verified recording: no button, not even a dead one. */
  if (!canPlayDhikr(item)) return null;

  const mine = audio.dhikrId === item.id;
  const status = mine ? audio.status : "idle";
  /* Which source this card plays from — the live state if it owns the player,
     otherwise straight from the card's own references. */
  const source = mine && audio.source ? audio.source : (item.audio ?? []).length > 0 ? "quran" : "hisn";

  const label =
    status === "playing"
      ? t("adhkar.audioPause")
      : status === "paused"
        ? t("adhkar.audioResume")
        : t("adhkar.audioPlay");

  const button = (
    <button
      type="button"
      onClick={() => toggleDhikrAudio(item)}
      aria-label={label}
      aria-pressed={status === "playing"}
      className={
        variant === "compact"
          ? `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              status === "playing"
                ? "bg-gold text-primary-deep"
                : "bg-surface-2 text-muted hover:text-gold-strong"
            }`
          : `flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              status === "playing"
                ? "bg-gold text-primary-deep"
                : "bg-gold-soft text-gold-strong hover:bg-gold hover:text-primary-deep"
            }`
      }
    >
      {status === "loading" ? (
        <Loader2 size={variant === "compact" ? 16 : 17} className="animate-spin" />
      ) : status === "playing" ? (
        <Pause size={variant === "compact" ? 16 : 17} strokeWidth={2.6} />
      ) : (
        <Play size={variant === "compact" ? 16 : 17} strokeWidth={2.6} />
      )}
      {variant === "full" && label}
    </button>
  );

  if (variant === "compact") {
    return (
      <span className="inline-flex">
        {button}
        <span className="sr-only" aria-live="polite">
          {statusText(status, audio.error, t)}
        </span>
      </span>
    );
  }

  /* The reciter line: a picker for Quran cards (their verses have several
     verified recitations), a fixed, verifiable name for the Hisn recording. */
  const activeReciter =
    source === "quran"
      ? mine && audio.reciterId
        ? adhkarReciters(locale).find((r) => r.id === audio.reciterId)?.name ?? ""
        : adhkarReciters(locale).find((r) => r.id === reciter)?.name ?? ""
      : t("adhkar.audioReciterHisn");

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface px-3 py-3">
      <div className="flex items-center gap-2">
        {source === "quran" ? (
          <>
            <label
              htmlFor={`reciter-${item.id}`}
              className="shrink-0 text-[11px] font-bold text-muted"
            >
              {t("adhkar.audioReciterLabel")}
            </label>
            <select
              id={`reciter-${item.id}`}
              value={reciter}
              onChange={(event) => {
                saveAdhkarReciter(event.target.value);
                setReciter(event.target.value as typeof reciter);
              }}
              className="h-9 min-w-0 flex-1 rounded-xl bg-surface-2 px-2 text-xs font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {adhkarReciters(locale).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="flex-1 truncate text-[11px] font-bold text-muted">
            {t("adhkar.audioReciterLabel")}: {t("adhkar.audioReciterHisn")}
          </span>
        )}
        {button}
      </div>

      <p className="mt-2 text-[11px] font-bold text-muted" aria-live="polite">
        {statusText(status, audio.error, t)}
        {mine && status !== "idle" && activeReciter ? ` · ${activeReciter}` : ""}
      </p>

      {/* The recording may read more than the card shows (a whole verse, or the
          book's neighbouring phrase): say so here, before the credit. */}
      {item.audioNote && (
        <p className="mt-1 text-[10px] leading-5 text-muted">{item.audioNote}</p>
      )}

      <p className="mt-1 text-[10px] text-muted">
        {source === "quran" ? t("adhkar.audioCredit") : t("adhkar.audioCreditHisn")}
      </p>
    </div>
  );
}

function statusText(
  status: string,
  error: string | null,
  t: (key: string) => string
): string {
  if (status === "error") {
    return error === "offline" ? t("adhkar.audioOffline") : t("adhkar.audioFailed");
  }
  if (status === "loading") return t("adhkar.audioLoading");
  if (status === "playing") return t("adhkar.audioPlaying");
  if (status === "paused") return t("adhkar.audioPaused");
  return "";
}
