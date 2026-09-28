"use client";

import {
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  Lightbulb,
  PenLine,
  Sparkles,
  Sprout,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurahBadge, VerseText } from "@/components/quran";
import { TAFSIR } from "@/data/quran";
import type { TafsirEntry } from "@/lib/quran/types";
import { useLocale } from "@/lib/locale";
import type { QuranData } from "@/hooks/useQuran";
import type { WardDay, TadabburJournalEntry } from "@/lib/types";
import {
  loadTadabburJournal,
  saveTadabburJournal,
} from "@/lib/storage";

type SectionDef = { key: string; icon: typeof BookOpen; labelKey: string; subKey: string };

const SECTION_DEFS: SectionDef[] = [
  { key: "tafsir", icon: BookOpen, labelKey: "tadabbur.section.tafsir", subKey: "tadabbur.section.tafsirSub" },
  { key: "simple", icon: Lightbulb, labelKey: "tadabbur.section.simple", subKey: "tadabbur.section.simpleSub" },
  { key: "live", icon: Sprout, labelKey: "tadabbur.section.live", subKey: "tadabbur.section.liveSub" },
  { key: "reflect", icon: Sparkles, labelKey: "tadabbur.section.reflect", subKey: "tadabbur.section.reflectSub" },
];

function getTafsirForRef(ref: string): TafsirEntry | null {
  return TAFSIR.find((entry) => entry.ref === ref) ?? null;
}

export function TadabburSection({
  candidate,
  candidateResolved,
  wardDay,
  quran,
}: {
  candidate: string;
  candidateResolved: { chapter: { name: string; verses: { number: number; text: string }[] }; verse: { number: number; text: string } } | null;
  wardDay: WardDay | null;
  quran: QuranData;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerDone, setTimerDone] = useState(false);
  const [stepDone, setStepDone] = useState(false);
  const [personalNote, setPersonalNote] = useState("");
  const [journal, setJournal] = useState<TadabburJournalEntry[]>([]);
  const [justCompleted, setJustCompleted] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tafsir = useMemo(() => (candidate ? getTafsirForRef(candidate) : null), [candidate]);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe one-time load from localStorage */
  useEffect(() => {
    setJournal(loadTadabburJournal());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!timerActive) return;
    intervalRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimerActive(false);
          setTimerDone(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerActive]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(true);
    setOpenSections(new Set(["tafsir", "simple", "live", "reflect"]));
  }, []);

  const startTimer = useCallback(() => {
    setTimerSeconds(60);
    setTimerActive(true);
    setTimerDone(false);
  }, []);

  const markStepDone = useCallback(() => {
    setStepDone(true);
    setJustCompleted(true);
    window.setTimeout(() => setJustCompleted(false), 4500);
    const entry: TadabburJournalEntry = {
      ref: candidate,
      date: new Date().toISOString().slice(0, 10),
      completedAt: new Date().toISOString(),
      appliedStep: true,
      personalNote,
    };
    const next = [...journal.filter((e) => e.ref !== candidate), entry].slice(-100);
    setJournal(next);
    saveTadabburJournal(next);
  }, [candidate, personalNote, journal]);

  const saveNote = useCallback(() => {
    const entry: TadabburJournalEntry = {
      ref: candidate,
      date: new Date().toISOString().slice(0, 10),
      completedAt: new Date().toISOString(),
      appliedStep: stepDone,
      personalNote,
    };
    const next = [...journal.filter((e) => e.ref !== candidate), entry].slice(-100);
    setJournal(next);
    saveTadabburJournal(next);
    setNoteOpen(false);
  }, [candidate, personalNote, stepDone, journal]);

  const hadPreviousJournal = useMemo(
    () => journal.some((e) => e.ref === candidate),
    [journal, candidate]
  );

  if (!candidateResolved || !tafsir) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <section className="animate-fade-slide-up animate-delay-1 mt-4">
      <div className="mb-2 px-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted">
          <Sparkles size={12} className="text-gold-strong" />
          {t("tadabbur.title")}
        </div>
        <p className="mt-0.5 text-xs text-muted">{t("tadabbur.subtitle")}</p>
      </div>

      {/* MAIN CARD */}
      <div className="overflow-hidden rounded-[32px] border border-gold/40 bg-surface shadow-sm">
        {/* VERSE */}
        <div className="p-5 text-center">
          <div className="mb-3 flex justify-center">
            <SurahBadge name={candidateResolved.chapter.name} />
          </div>
          <p className="mb-3 text-xs font-black text-primary">
            {t("tadabbur.verseOf", { name: candidateResolved.chapter.name, number: candidateResolved.verse.number })}
          </p>
          <VerseText text={candidateResolved.verse.text} className="text-xl leading-[2.3]" />
        </div>

        {/* DEFERRED NOTICE */}
        {wardDay?.deferred && !wardDay.tadabburDone && (
          <div className="mx-5 mb-3 animate-fade-up rounded-2xl border border-gold/40 bg-gold-soft/50 px-3 py-2 text-center text-xs font-bold text-gold-strong">
            {t("tadabbur.deferred")}
          </div>
        )}

        {/* CTA BUTTONS */}
        {!expanded && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-primary text-xs font-black text-white shadow-md transition active:scale-95"
              >
                <Sparkles size={15} />
                {t("tadabbur.start")}
              </button>
              {!wardDay?.tadabburDone && (
                <button
                  type="button"
                  onClick={quran.deferTadabbur}
                  className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-xs font-bold text-ink transition active:scale-95"
                >
                  <Clock3 size={15} />
                  {t("tadabbur.defer")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* EXPANDED CONTENT */}
        {expanded && (
          <div className="animate-fade-up border-t border-line">
            {/* ACCORDION SECTIONS */}
            {SECTION_DEFS.map((section) => {
              const isOpen = openSections.has(section.key);
              const Icon = section.icon;
              return (
                <div key={section.key} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary flex w-full items-center gap-3 px-5 py-3.5 text-right"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                      <Icon size={15} className="text-primary" />
                    </span>
                    <span className="flex-1">
                      <span className="text-sm font-black">{t(section.labelKey)}</span>
                      <span className="me-2 text-xs font-bold text-muted">{t(section.subKey)}</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="animate-fade-up px-5 pb-4">
                      <SectionContent sectionKey={section.key} tafsir={tafsir} t={t} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* TIMER */}
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <Clock3 size={14} className="text-primary" />
                <span className="text-xs font-black text-primary">{t("tadabbur.timerTitle")}</span>
              </div>
              {!timerActive && !timerDone && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={startTimer}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary flex h-10 items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft px-4 text-xs font-black text-primary transition active:scale-95"
                  >
                    <Clock3 size={14} />
                    {t("tadabbur.timerStart")}
                  </button>
                </div>
              )}
              {timerActive && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-2xl font-black tabular-nums text-primary">
                    {formatTime(timerSeconds)}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-soft">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-1000"
                      style={{ width: `${(timerSeconds / 60) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {timerDone && (
                <p className="mt-3 text-xs font-bold text-success animate-fade-up">
                  {t("tadabbur.timerDone")}
                </p>
              )}
            </div>

            {/* PRACTICAL STEP */}
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <Sprout size={14} className="text-success" />
                <span className="text-xs font-black text-success">{t("tadabbur.stepTitle")}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink">{tafsir.practicalStep}</p>
              <button
                type="button"
                onClick={markStepDone}
                disabled={stepDone}
                className={`focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary mt-3 flex h-10 items-center justify-center gap-1.5 rounded-2xl text-xs font-black transition active:scale-95 ${
                  stepDone
                    ? "bg-success-soft text-success"
                    : "bg-primary text-white shadow-md"
                } w-full`}
              >
                {stepDone ? (
                  <>
                    <Check size={15} strokeWidth={3} />
                    {t("tadabbur.stepDone")}
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    {t("tadabbur.stepTodo")}
                  </>
                )}
              </button>
            </div>

            {/* PERSONAL NOTE */}
            <div className="px-5 py-4">
              <button
                type="button"
                onClick={() => setNoteOpen(!noteOpen)}
                aria-label={t("tadabbur.reflectTitle")}
                className="flex items-center gap-2"
              >
                <PenLine size={14} className="text-gold-strong" />
                <span className="text-xs font-black text-gold-strong">{t("tadabbur.reflectTitle")}</span>
              </button>
              {noteOpen && (
                <div className="animate-fade-up mt-3">
                  <textarea
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    placeholder={t("tadabbur.reflectPlaceholder")}
                    rows={3}
                    className="w-full rounded-2xl border border-line bg-surface-2 p-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={saveNote}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary mt-2 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gold px-4 text-xs font-black text-primary-deep transition active:scale-95"
                  >
                    {t("tadabbur.reflectSave")}
                  </button>
                </div>
              )}
              {!noteOpen && hadPreviousJournal && (
                <p className="mt-2 text-xs text-muted">
                  {t("tadabbur.reflectHint")}
                </p>
              )}
            </div>

            {/* CELEBRATION */}
            {justCompleted && (
              <div
                aria-live="polite"
                aria-atomic="true"
                className="animate-scale-in-soft mx-5 mb-4 rounded-2xl bg-success-soft p-4 text-center"
              >
                <p className="text-sm font-black text-success">
                  {t("tadabbur.celebrate")}
                </p>
              </div>
            )}

            {/* COMPLETED STATE */}
            {wardDay?.tadabburDone && (
              <div className="mx-5 mb-4 rounded-2xl bg-gold-soft p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gold text-primary-deep">
                  <Check size={20} strokeWidth={3} />
                </div>
                <p className="mt-2 text-sm font-black text-gold-strong">{t("tadabbur.completed")}</p>
                <p className="mt-1 text-xs text-muted">{t("tadabbur.retake")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SectionContent({
  sectionKey,
  tafsir,
  t,
}: {
  sectionKey: string;
  tafsir: TafsirEntry;
  t: (key: string) => string;
}) {
  switch (sectionKey) {
    case "tafsir":
      return (
        <div>
          <p className="text-sm leading-7 text-ink">{tafsir.simplifiedMeaning}</p>
          <p className="mt-2 text-xs font-bold text-muted">
            {t("tadabbur.source")} {tafsir.tafsirSource}
          </p>
        </div>
      );
    case "simple":
      return (
        <p className="text-sm leading-7 text-ink">{tafsir.simplerMeaning}</p>
      );
    case "live":
      return (
        <ul className="space-y-2">
          {tafsir.howToLive.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6 text-ink">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              {item}
            </li>
          ))}
        </ul>
      );
    case "reflect":
      return (
        <p className="text-sm font-bold leading-7 text-primary">{tafsir.reflection}</p>
      );
    default:
      return null;
  }
}
