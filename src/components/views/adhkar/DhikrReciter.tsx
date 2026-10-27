"use client";

import { Check, ChevronLeft, ChevronRight, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { ProgressRing } from "@/components/ProgressRing";
import type { DhikrItem } from "@/data/adhkar";
import { loadDhikrFeedback, playCompletionFeedback, playDhikrTapFeedback } from "@/lib/dhikrFeedback";
import { useLocale } from "@/lib/locale";
import { getDhikrVoices, isTtsSupported, loadSelectedVoiceName, saveSelectedVoiceName, speakDhikr, stopDhikrSpeech } from "@/lib/dhikrTts";
import type { DhikrVoice } from "@/lib/dhikrTts";
import { useVoiceDhikr, isVoiceRecognitionSupported } from "@/hooks/useVoiceDhikr";

/* Helper: parse verse markers like "(1)" into verse number + text. Used by
   VersesMushaf for mushaf-style rendering of quran-type dhikr items. */
function parseVerses(text: string): { num: number | null; text: string }[] {
  const result: { num: number | null; text: string }[] = [];
  const regex = /\((\d+)\)\s*/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastEnd) {
      result.push({ num: null, text: text.slice(lastEnd, match.index).trim() });
    }
    result.push({ num: parseInt(match[1], 10), text: "" });
    lastEnd = regex.lastIndex;
  }
  if (lastEnd < text.length) {
    result.push({ num: null, text: text.slice(lastEnd).trim() });
  }
  return result.filter((v) => v.text);
}

export function DhikrReciter({
  title,
  items,
  startIndex = 0,
  countOf,
  onIncrement,
  onExit,
}: {
  title: string;
  items: DhikrItem[];
  /* Where the session opens. The caller passes the first dhikr still owed today
     so a resumed session continues instead of replaying what is already done. */
  startIndex?: number;
  /* Reads the persisted count, so the counter survives a remount and the card
     list and the reciter can never disagree about what is done. */
  countOf: (item: DhikrItem) => number;
  /* One tap = one repetition. Persistence belongs to the caller: it owns the
     counts state, so writing to the store from here left every count on screen
     stale until a remount. */
  onIncrement: (item: DhikrItem) => void;
  onExit: () => void;
}) {
  const { t } = useLocale();
  const [index, setIndex] = useState(
    Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1))
  );
  const [leaving, setLeaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<DhikrVoice[]>([]);
  useEffect(() => {
    if (!isTtsSupported()) return;
    let cancelled = false;
    const load = () => {
      getDhikrVoices()
        .then((list) => {
          if (!cancelled) setVoices(list);
        })
        .catch(() => {});
    };
    load();
    const synth =
      typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (synth) synth.onvoiceschanged = load;
    return () => {
      cancelled = true;
      if (synth) synth.onvoiceschanged = null;
    };
  }, []);
  const [voiceOn, setVoiceOn] = useState(false);
  const timerRef = useRef<number | null>(null);

  const item = items[index];
  const isLast = index === items.length - 1;

  const target = item?.count ?? 1;
  const current = item ? Math.min(countOf(item), target) : 0;
  const remaining = target - current;
  /* True when this dhikr is still owed. A multi-count dhikr stays on screen
     until its last repetition, so the session is a real tasbih counter instead
     of one tap satisfying 100 at once. */
  const stillOwed = remaining > 0;

  const advance = useCallback(() => {
    if (leaving || !item) return;
    onIncrement(item);
    /* Every tap gets a light confirmation. The final repetition gets a
       distinct resolution so the ear can tell "this one is the last" from
       "the session is over". */
    const prefs = loadDhikrFeedback();
    /* Check BEFORE re-render: remaining is stale, but the closure check
       correctly identifies the last repetition. For last rep, use
       completion feedback; for others, use the tap feedback. */
    if (target > 1 && remaining <= 1) playCompletionFeedback(prefs);
    else if (remaining > 0) playDhikrTapFeedback(prefs);
    /* Still repetitions left: stay on this dhikr. */
    if (remaining > 1) return;
    if (isLast) { setFinished(true); return; }
    setLeaving(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setLeaving(false);
      setIndex((i) => i + 1);
    }, 300);
  }, [item, isLast, leaving, onIncrement, remaining, target]);

  const advanceRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  const voice = useVoiceDhikr({
    targetText: (item?.text ?? ""),
    onCount: () => advanceRef.current?.(),
    enabled: voiceOn && !finished && stillOwed,
  });

  /* Stop voice + speech on unmount. */
  useEffect(() => () => { setVoiceOn(false); stopDhikrSpeech(); }, []);

  if (finished) {
    return <DoneScreen title={title} onExit={onExit} />;
  }

  /* The card must exist: `index` is clamped into range, and an empty list is
     guarded by the caller, but rendering `item.id` on undefined would throw. */
  if (!item) return null;

  /* Off-by-one: the old expression showed (n-1)/n on the final card and never
     reached 100%, while the counter beside it read n/n. */
  const pct = ((index + 1) / items.length) * 100;
  const counter = t("adhkar.progress", { current: String(index + 1), total: String(items.length) });

  return (
    <div className="mt-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          aria-label={t("adhkar.exit")}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2 text-muted transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X size={17} />
        </button>
        <div className="flex items-center gap-2">
          {isTtsSupported() && (
            <button
              type="button"
              onClick={() => {
                if (speaking) {
                  stopDhikrSpeech();
                  setSpeaking(false);
                } else {
                  setSpeaking(true);
                  speakDhikr(item?.text ?? "", loadSelectedVoiceName(), () => setSpeaking(false));
                }
              }}
              aria-label={speaking ? t("adhkar.playRecitation") : t("adhkar.playRecitation")}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2 text-muted transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          )}
          {isVoiceRecognitionSupported() && (
            <button
              type="button"
              onClick={() => setVoiceOn((v) => !v)}
              aria-pressed={voiceOn}
              aria-label={t("adhkar.voiceCount")}
              className={`flex h-10 items-center gap-1.5 rounded-2xl px-3 text-xs font-black transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                voiceOn
                  ? "bg-gold text-primary-deep"
                  : "bg-surface-2 text-muted"
              }`}
            >
              {voiceOn ? <Mic size={15} /> : <MicOff size={15} />}
              {voiceOn ? t("adhkar.voiceListening") : t("adhkar.voiceCount")}
            </button>
          )}
        </div>
        <span className="num-ltr text-xs font-black tabular-nums text-muted">{counter}</span>
      </div>
      {isTtsSupported() && voices.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[11px] font-bold text-muted">{t("adhkar.voiceChooseVoice")}</label>
          <select
            value={loadSelectedVoiceName() ?? ""}
            onChange={(e) => saveSelectedVoiceName(e.target.value || null)}
            className="h-8 flex-1 rounded-xl bg-surface-2 px-2 text-xs font-bold text-ink"
          >
            <option value="">{t("adhkar.voiceChooseVoice")}</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* progress */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-l from-gold to-gold-strong transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* page card */}
      <div className="mt-5 [perspective:1200px]">
        <div
          key={item.id}
          className={leaving ? "animate-dhikr-leave" : "animate-dhikr-arrive"}
        >
          <Card
            className={`
              overflow-hidden p-0
              ${
                item.type === "quran"
                  ? "border-2 border-gold/50 bg-gold-soft/40"
                  : ""
              }
            `}
          >
            <div className="flex items-center gap-1.5 px-5 pt-5">
              <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-black text-gold-strong">
                {item.type === "quran" ? t("adhkar.quran") : t("adhkar.sunnah")}
              </span>
              {target > 1 && (
                <span className="num-ltr rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black tabular-nums text-muted">
                  {t("adhkar.progress", { current: String(current), total: String(target) })}
                </span>
              )}
              <span className="ms-auto rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-black text-gold-strong">
                {t(`adhkar.authenticity.${item.authenticity}`)}
              </span>
            </div>

            {/* For quran type: render verses in mushaf style with ayah numbers */}
            <div className={`px-5 ${target > 1 ? "mt-5" : "mt-4"} pb-5`}>
              {item.title && (
                <p className="mb-3 flex items-center justify-center gap-2 text-base font-black text-gold-strong">
                  <span aria-hidden="true">✦</span>
                  {item.title}
                  <span aria-hidden="true">✦</span>
                </p>
              )}

              {item.type === "quran" ? (
                <VersesMushaf text={item.text} />
              ) : (
                <p className="break-words whitespace-pre-line text-ink text-dhikr">
                  {item.text}
                </p>
              )}

              {target > 1 && (
                <div className="mt-5 flex flex-col items-center">
                  <p className="text-xs font-bold text-muted">{t("adhkar.remaining", { n: remaining })}</p>
                </div>

              )}

              {item.note && (
                <p className="mt-4 break-words border-s-2 border-gold/40 ps-3 text-xs leading-6 text-muted">
                  {item.note}
                </p>
              )}

              <p className="mt-3 break-words text-[11px] text-muted">{item.source}</p>
            </div>
          </Card>
        </div>
      </div>

      <p className="mt-5 text-center text-xs font-bold text-muted">
        {stillOwed ? t("adhkar.tapHint") : t("adhkar.finish")}
      </p>

      {voiceOn && (
        <p className="mt-2 text-center text-[11px] font-bold text-muted" aria-live="polite">
          {voice.error === "unsupported"
            ? t("adhkar.voiceUnsupported")
            : voice.error
            ? t("adhkar.voiceNotHeard")
            : voice.lastHeard
            ? `${t("adhkar.voiceCounted")}: ${voice.lastHeard}`
            : t("adhkar.voiceListening")}
        </p>
      )}

      {/* Done button (dim by default, bright on press) */}
      <button
        type="button"
        onClick={advance}
        className={`
          mx-auto mt-3 flex h-14 w-44 items-center justify-center gap-2
          rounded-3xl border border-gold/30 transition active:scale-95
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
          ${
            isLast && !stillOwed
              ? "bg-gold text-primary-deep"
              : "bg-gold-soft text-gold-strong"
          }
        `}
      >
        <Check size={18} strokeWidth={3} />
        {isLast && !stillOwed ? t("adhkar.finish") : t("adhkar.done")}
      </button>

      {/* Prev / Next page controls */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (index > 0) setIndex(index - 1);
          }}
          aria-label={t("adhkar.prev")}
          className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
            index > 0
              ? "bg-surface-2 text-muted hover:bg-gold/20"
              : "bg-surface-2 opacity-30"
          } transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
        >
          <ChevronLeft size={16} className="rtl:rotate-180" />
        </button>
        <span className="text-xs font-bold text-muted">{index + 1}/{items.length}</span>
        <button
          type="button"
          onClick={() => {
            if (index < items.length - 1) setIndex(index + 1);
          }}
          aria-label={t("adhkar.next")}
          className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
            index < items.length - 1
              ? "bg-surface-2 text-muted hover:bg-gold/20"
              : "bg-surface-2 opacity-30"
          } transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
        >
          <ChevronRight size={16} className="rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}

function VersesMushaf({ text }: { text: string }) {
  const verses = useMemo(() => parseVerses(text), [text]);
  return (
    <div className="space-y-1">
      {verses.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex w-5 items-center justify-center rounded-full bg-gold text-[10px] font-black text-primary-deep">
            {v.num ?? "--"}
          </span>
          <span className="font-quran text-base text-ink">{v.text}</span>
        </div>
      ))}
    </div>
  );
}

function DoneScreen({ title, onExit }: { title: string; onExit: () => void }) {
  const { t } = useLocale();
  return (
    <div className="mt-10 flex flex-col items-center text-center animate-scale-in">
      <ProgressRing
        percent={100}
        size={112}
        stroke={8}
        animated
        label={
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-primary-deep shadow-[0_10px_24px_-10px_var(--gold)]">
            <Check size={34} strokeWidth={3} />
          </span>
        }
      />
      <h2 className="mt-6 text-2xl font-black text-ink">{title}</h2>
      <p className="mt-2 text-lg font-black text-gold-strong">{t("adhkar.sessionDone")}</p>
      <p className="mt-3 max-w-64 text-sm font-bold leading-7 text-muted">
        {t("adhkar.sessionDoneHint")}
      </p>
      <button
        type="button"
        onClick={onExit}
        className="mt-8 flex h-13 items-center justify-center gap-1.5 rounded-3xl bg-gold px-7 text-sm font-black text-primary-deep shadow-[0_8px_20px_-10px_var(--gold)] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronRight size={16} />
        {t("adhkar.backToList")}
      </button>
    </div>
  );
}
