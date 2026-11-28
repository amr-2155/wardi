"use client";

import { Bookmark, BookOpen, Check, ChevronLeft, Clock3, HeartHandshake, History, ArrowDownToLine, MoonStar, ScrollText, Search, Shuffle, Sparkles, Sunrise, Target } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Card, SegmentControl, Sheet } from "@/components/ui";
import { DatasetNotice } from "@/components/DatasetNotice";
import { VerseText } from "@/components/quran";
import { TAFSIR, TOPICS } from "@/data/quran";
import { tadabburPool } from "@/lib/quran/tafsir";
import { useLocale } from "@/lib/locale";
import type { FullViewId } from "@/lib/types";
import type { QuranData } from "@/hooks/useQuran";
import type { Chapter, Verse, QuranSearchResult } from "@/lib/quran/types";
import { DATASET_META } from "@/lib/quran/store";
import { toArabicIndic } from "@/lib/quran/mushaf";
import { refFromGlobalId } from "@/lib/quran/progress";
import {
  MUSHAF_QURAN_LAST_PAGE_KEY,
  resolveQuranResumePage,
} from "@/lib/quran/mushafSession";
import { QURAN_DUA_REFS, SAJDA_REFS } from "@/data/quranLists";
import { useDailyEssentials } from "@/hooks/useDailyEssentials";
import { formatHijri, todayHijri } from "@/lib/hijri";
import type { WardData } from "@/hooks/useWardData";
import { RecitersView } from "@/components/views/audio/RecitersView";
import { MiniPlayer } from "@/components/views/audio/MiniPlayer";

const topics = TOPICS;

export function LibraryView({
  quran,
  data,
  onOpenAyah,
  onOpenDaily,
  onOpen,
}: {
  quran: QuranData;
  data: WardData;
  onOpenAyah: (ayahId: string) => void;
  onOpenDaily: () => void;
  onOpen: (view: FullViewId) => void;
}) {
  const { t, locale } = useLocale();
  const hijriLabel = useMemo(() => formatHijri(todayHijri(), locale), [locale]);
  const [query, setQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [section, setSection] = useState<"search" | "bookmarks" | "index">("search");
  const [subSection, setSubSection] = useState<"verses" | "audio">("verses");
  const [indexTab, setIndexTab] = useState<"surahs" | "juz">("surahs");
  const [duaOpen, setDuaOpen] = useState(false);
  const [sajdaOpen, setSajdaOpen] = useState(false);
  /* Last mushaf page the user actually read; null until mounted (the key
     lives in localStorage, unreadable during prerender) and null when the
     user never opened the mushaf, in which case the resume card hides. */
  const [resumePage] = useState<number | null>(() => {
    try {
      if (localStorage.getItem(MUSHAF_QURAN_LAST_PAGE_KEY) === null) return null;
      return resolveQuranResumePage();
    } catch {
      // storage unavailable (or prerender); the card simply stays hidden
      return null;
    }
  });
  const sectionsRef = useRef<HTMLDivElement>(null);
  const essentials = useDailyEssentials();

  /* The input stays controlled by `query` so typing is always immediate, while
     the (heavier) result list renders from a deferred value. Keeps the field
     responsive while a query is still settling. */
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => quran.search(deferredQuery, 40), [quran, deferredQuery]);

  const topicVerses = useMemo(() => {
    const topic = selectedTopic ? topics.find((tp) => tp.name === selectedTopic) : null;
    return topic ? topic.ayahs : [];
  }, [selectedTopic]);

  const dailyAyah = quran.getAyah(quran.daily?.ref ?? "");
  const dailyVisible = quran.dailyReady && dailyAyah;

  /* A query that is exactly an ayah reference ("2:255", "٢:٢٥٥") jumps
     straight to that ayah instead of running a text search. Validity is
     checked against the loaded dataset, never against the pattern alone. */
  const refQuery = useMemo(() => {
    const normalized = deferredQuery
      .trim()
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const m = /^(\d{1,3})\s*[:：.\- ]\s*(\d{1,3})$/.exec(normalized);
    if (!m) return null;
    const ref = `${Number(m[1])}:${Number(m[2])}`;
    return quran.getAyah(ref) ? ref : null;
  }, [deferredQuery, quran]);

  /* Surah/juz index, derived from the bundled dataset + pagination meta.
     Fully offline, and it invents nothing: names, counts, makkah/madinah and
     pages all come from data the app already ships. */
  const surahRows = useMemo(() => {
    const ds = quran.dataset;
    const meta = quran.meta;
    if (!ds || !meta) return [];
    let firstGid = 1;
    return ds.chapters.map((c) => {
      const row = {
        id: c.id,
        name: c.name,
        ayahCount: c.ayahCount,
        place: c.revelationPlace,
        page: meta.pageByAyah[firstGid - 1] ?? 0,
      };
      firstGid += c.ayahCount;
      return row;
    });
  }, [quran.dataset, quran.meta]);

  const juzRows = useMemo(() => {
    const ds = quran.dataset;
    const meta = quran.meta;
    if (!ds || !meta) return [];
    const rows: { juz: number; ref: string; name: string; ayah: number; page: number }[] = [];
    let cur = 0;
    for (let i = 0; i < meta.juzByAyah.length; i += 1) {
      const j = meta.juzByAyah[i];
      if (j === cur) continue;
      cur = j;
      const resolved = quran.getAyah(refFromGlobalId(ds, i + 1) ?? "");
      if (!resolved) continue;
      rows.push({
        juz: j,
        ref: `${resolved.chapter.id}:${resolved.verse.number}`,
        name: resolved.chapter.name,
        ayah: resolved.verse.number,
        page: meta.pageByAyah[i] ?? 0,
      });
    }
    return rows;
  }, [quran.dataset, quran.meta, quran]);

  /* Reflection stops: the curated tadabbur pool, validated against the
     loaded dataset. A tap opens one of them at random. */
  const tadabburRefs = useMemo(
    () => (quran.dataset ? tadabburPool(TAFSIR, quran.dataset) : []),
    [quran.dataset],
  );
  const openTadabburStop = () => {
    if (tadabburRefs.length === 0) return;
    onOpenAyah(tadabburRefs[Math.floor(Math.random() * tadabburRefs.length)]);
  };

  const showResults = deferredQuery.trim().length > 0 || (selectedTopic && topicVerses.length > 0);
  const listRefs = refQuery
    ? [refQuery]
    : deferredQuery.trim().length > 0
      ? results.map((r) => r.ref)
      : topicVerses;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 animate-fade-slide-up">
      {/* HEADER */}
      <header className="animate-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center gap-2 pb-4 pt-6">
          <BookOpen size={22} className="text-gold-strong" />
          <div>
            <h1 className="display-md text-ink">{t("library.title")}</h1>
            <p className="text-[11px] text-muted">{t("library.subtitle")}</p>
          </div>
        </div>
      </header>

      {/* DAILY ESSENTIALS — the entry points for the adhkar, prayer, intention
          and reading screens. These four views were fully built and fully
          translated but no control in the app ever opened them; they live in
          the library so Home stays focused on the ward. */}
      <section className="mt-4">
        <h2 className="mb-2 px-1 text-[11px] font-black text-muted">{t("home.essentials")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard
            icon={<Sunrise size={19} />}
            tone="gold"
            title={t("home.featureAdhkarTitle")}
            subtitle={t("home.featureAdhkarSub")}
            badge={
              essentials.loaded && essentials.adhkarDone > 0
                ? `${essentials.adhkarDone}/${essentials.adhkarTotal}`
                : undefined
            }
            done={essentials.adhkarComplete}
            onPress={() => onOpen("adhkar")}
          />
          <FeatureCard
            icon={<Clock3 size={19} />}
            tone="teal"
            title={t("home.featurePrayerTitle")}
            subtitle={t("home.featurePrayerSub")}
            onPress={() => onOpen("prayer")}
          />
          <FeatureCard
            icon={<Target size={19} />}
            tone="violet"
            title={t("home.featureNiyyahTitle")}
            subtitle={t("home.featureNiyyahSub")}
            badge={
              essentials.loaded && essentials.niyyahCount === 0
                ? t("home.featureNiyyahEmpty")
                : undefined
            }
            onPress={() => onOpen("niyyah")}
          />
          <FeatureCard
            icon={<ScrollText size={19} />}
            tone="rose"
            title={t("home.featureIndexTitle")}
            subtitle={t("home.featureIndexSub")}
            onPress={() => {
              setSection("index");
              sectionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>
      </section>

      {/* RESUME READING — one tap back to the last mushaf page, with the
          whole-mushaf progress underneath. Hidden until the user has
          actually read a page. */}
      {resumePage !== null && (
        <button
          type="button"
          onClick={() => onOpen("mushaf")}
          className="mt-3 w-full rounded-[22px] border border-gold/30 bg-gold-soft p-4 text-start shadow-sm transition active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep">
              <History size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-ink">{t("library.continueTitle")}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-muted">
                {t("library.continuePage", {
                  page: toArabicIndic(resumePage),
                  total: toArabicIndic(604),
                })}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-black text-gold-strong">
              {toArabicIndic(Math.round((resumePage / 604) * 100))}٪
            </span>
          </span>
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full bg-gold transition-[width]"
              style={{ width: `${Math.max(2, Math.round((resumePage / 604) * 100))}%` }}
            />
          </span>
        </button>
      )}

      {/* DAILY AYAH + TADABBUR STOP — the personal curated picks sit right
          under the resume card; the ready-made lists come after. */}
      {dailyVisible && dailyAyah && (
        <button
          type="button"
          onClick={onOpenDaily}
          className="mt-3 flex w-full items-center gap-3 rounded-[22px] border border-gold/40 bg-gold-soft p-4 text-start shadow-sm transition active:scale-[0.99] animate-fade-up"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep">
            <Sparkles size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-gold-strong">{t("library.dailyVerse")}</span>
            <span className="mt-0.5 block text-sm font-black text-ink">
              {dailyAyah.chapter.name} · {t("library.verse")} {dailyAyah.verse.number}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[10px] font-black text-gold-strong shadow-sm ring-1 ring-gold/20">
            {t("library.openTadabbur")}
          </span>
        </button>
      )}

      <WideCard
        icon={<Shuffle size={19} />}
        title={t("library.tadabburStopTitle")}
        sub={t("library.tadabburStopSub")}
        onPress={openTadabburStop}
        delay={60}
      />

      {/* READY LISTS — curated reference sets; every text renders from the
          verified dataset, nothing is stored twice. */}
      <h2 className="mb-2 mt-6 px-1 text-[11px] font-black text-muted">{t("library.listsLabel")}</h2>
      <div className="flex flex-col gap-3">
        <WideCard
          icon={<HeartHandshake size={19} />}
          title={t("library.duasTitle")}
          sub={t("library.duasSub")}
          onPress={() => setDuaOpen(true)}
        />
        <WideCard
          icon={<ArrowDownToLine size={19} />}
          title={t("library.sajdaTitle")}
          sub={t("library.sajdaSub")}
          onPress={() => setSajdaOpen(true)}
          delay={50}
        />
        <WideCard
          icon={<MoonStar size={19} />}
          title={t("home.featureOccTitle")}
          sub={`${t("home.featureOccSub")} · ${hijriLabel}`}
          onPress={() => onOpen("occasions")}
          delay={100}
        />
      </div>

      {/* SECTIONS */}
      <div className="mt-5" ref={sectionsRef}>
        <SegmentControl<"search" | "bookmarks" | "index">
          options={[
            { value: "search", label: t("library.searchTab") },
            { value: "bookmarks", label: `${t("library.bookmarksTab")} (${quran.bookmarks.length})` },
            { value: "index", label: t("library.indexTab") },
          ]}
          value={section}
          onChange={(val) => setSection(val)}
        />
      </div>

      {/* AUDIO SUB-SECTION (only when search is active) */}
      {section === "search" && (
        <div className="mt-4">
          <SegmentControl<"verses" | "audio">
            options={[
              { value: "verses", label: t("library.versesTab") },
              { value: "audio", label: t("library.audioTab") },
            ]}
            value={subSection}
            onChange={(val) => setSubSection(val)}
          />
        </div>
      )}

      {/* CONTENT */}
      {section === "search" ? (
        subSection === "audio" ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] text-muted">{t("library.audioDesc")}</p>
            <RecitersView />
          </div>
        ) : (
          <>
            {/* SEARCH */}
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
              <Search size={17} className="shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("library.searchPlaceholder")}
                className="w-full bg-transparent text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted"
                aria-label={t("library.searchPlaceholder")}
              />
            </div>

            {/* TOPICS */}
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold text-muted">{t("library.browseTopics")}</p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((topic, i) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setSelectedTopic(selectedTopic === topic.name ? null : topic.name);
                      setQuery("");
                    }}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 animate-fade-up ${
                      selectedTopic === topic.name
                        ? "bg-primary text-white"
                        : "bg-surface-2 text-ink hover:bg-primary-soft hover:text-primary"
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {topic.name}
                  </button>
                ))}
              </div>
            </div>

            {/* RESULTS. Without Quran text the list would render as an empty
                body -- every row resolves to null -- or claim "no results",
                so the real reason is stated first. */}
            <div className="mt-5 flex flex-col gap-2.5">
              {quran.datasetStatus !== "verified" && <DatasetNotice quran={quran} />}
              {quran.datasetStatus === "verified" && deferredQuery.trim().length > 0 && !refQuery && (
                <p className="text-[11px] text-muted">
                  {results.length > 0
                    ? `${results.length} ${t("library.resultsFor")} «${deferredQuery}»`
                    : `${t("library.noResults")} «${deferredQuery}»`}
                </p>
              )}
              {quran.datasetStatus === "verified" && selectedTopic && !showResults && (
                <TopicEmpty t={t} />
              )}
              {quran.datasetStatus === "verified" &&
                showResults &&
                (listRefs.length > 0 ? (
                  listRefs.map((ref, i) => {
                    const resolved = quran.getAyah(ref);
                    if (!resolved) return null;
                    const match = results.find((r) => r.ref === ref);
                    return (
                      <VerseCard
                        key={ref}
                        resolved={resolved}
                        match={match}
                        onClick={() => onOpenAyah(ref)}
                        delay={i * 60}
                      />
                    );
                  })
                ) : (
                  <TopicEmpty t={t} />
                ))}
            </div>
          </>
        )
      ) : section === "index" ? (
        // INDEX — surahs and juz, straight from the bundled dataset.
        <>
          {quran.datasetStatus !== "verified" ? (
            <div className="mt-5">
              <DatasetNotice quran={quran} />
            </div>
          ) : (
            <>
              <div className="mt-4">
                <SegmentControl<"surahs" | "juz">
                  options={[
                    { value: "surahs", label: t("library.surahsTab") },
                    { value: "juz", label: t("library.juzTab") },
                  ]}
                  value={indexTab}
                  onChange={(val) => setIndexTab(val)}
                />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {indexTab === "surahs"
                  ? surahRows.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onOpenAyah(`${c.id}:1`)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-start shadow-sm transition active:scale-[0.99] animate-fade-up"
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-[12px] font-black text-gold-strong">
                          {toArabicIndic(c.id)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-ink">{c.name}</span>
                          <span className="mt-0.5 block text-[10px] text-muted">
                            {t(c.place === "makkah" ? "library.makkah" : "library.madinah")}
                            {" · "}
                            {toArabicIndic(c.ayahCount)} {t("library.ayahsCount")}
                            {" · "}
                            {t("library.pageShort")} {toArabicIndic(c.page)}
                          </span>
                        </span>
                        <ChevronLeft size={15} className="shrink-0 text-muted rtl:rotate-180" />
                      </button>
                    ))
                  : juzRows.map((j, i) => (
                      <button
                        key={j.juz}
                        type="button"
                        onClick={() => onOpenAyah(j.ref)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-start shadow-sm transition active:scale-[0.99] animate-fade-up"
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-[12px] font-black text-primary">
                          {toArabicIndic(j.juz)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-ink">
                            {t("library.juzLabel")} {toArabicIndic(j.juz)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted">
                            {t("library.startsFrom")} {j.name} · {t("library.verse")} {toArabicIndic(j.ayah)}
                            {" · "}
                            {t("library.pageShort")} {toArabicIndic(j.page)}
                          </span>
                        </span>
                        <ChevronLeft size={15} className="shrink-0 text-muted rtl:rotate-180" />
                      </button>
                    ))}
              </div>
            </>
          )}
        </>
      ) : (
        // BOOKMARKS
        <>
          {/* Saved refs exist but cannot be rendered without Quran text. That
              used to be a blank screen under a "(3)" tab label. */}
          {quran.datasetStatus !== "verified" ? (
            <div className="mt-5">
              <DatasetNotice quran={quran} />
            </div>
          ) : quran.bookmarks.length === 0 ? (
            <Card className="mt-10 p-10 text-center text-muted animate-fade-up">
              <Bookmark size={30} className="mx-auto mb-3" />
              {t("library.noBookmarks")}
              <p className="mt-2 max-w-[240px] text-[11px] text-muted">{t("library.bookmarksHint")}</p>
            </Card>
          ) : (
            <div className="mt-5 flex flex-col gap-2.5">
              {quran.bookmarks.map((ref, i) => {
                const resolved = quran.getAyah(ref);
                if (!resolved) return null;
                return (
                  <VerseCard
                    key={ref}
                    resolved={resolved}
                    match={undefined}
                    bookmark={true}
                    onClick={() => onOpenAyah(ref)}
                    color="gold"
                    delay={i * 60}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* MINI PLAYER (global, always rendered when a track is loaded) */}
      <MiniPlayer />

      <Sheet open={duaOpen} onClose={() => setDuaOpen(false)} title={t("library.duasTitle")}>
        {quran.datasetStatus !== "verified" ? (
          <DatasetNotice quran={quran} />
        ) : (
          <div className="-mx-5 flex max-h-[72dvh] flex-col gap-2.5 overflow-y-auto px-5 pb-2">
            {QURAN_DUA_REFS.map((ref, i) => {
              const resolved = quran.getAyah(ref);
              if (!resolved) return null;
              return (
                <VerseCard
                  key={ref}
                  resolved={resolved}
                  match={undefined}
                  onClick={() => onOpenAyah(ref)}
                  delay={Math.min(i, 10) * 40}
                />
              );
            })}
          </div>
        )}
      </Sheet>

      <Sheet open={sajdaOpen} onClose={() => setSajdaOpen(false)} title={t("library.sajdaTitle")}>
        {quran.datasetStatus !== "verified" ? (
          <DatasetNotice quran={quran} />
        ) : (
          <div className="-mx-5 flex max-h-[72dvh] flex-col gap-2.5 overflow-y-auto px-5 pb-2">
            {SAJDA_REFS.map((ref, i) => {
              const resolved = quran.getAyah(ref);
              if (!resolved) return null;
              return (
                <VerseCard
                  key={ref}
                  resolved={resolved}
                  match={undefined}
                  onClick={() => onOpenAyah(ref)}
                  delay={Math.min(i, 10) * 40}
                />
              );
            })}
          </div>
        )}
      </Sheet>

      <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-muted">
        <Clock3 size={12} />
        {t("library.offlineNote")} {DATASET_META.source}
      </div>
    </div>
  );
}

function VerseCard({
  resolved,
  match,
  onClick,
  bookmark = false,
  color = "primary",
  delay = 0,
}: {
  resolved: { verse: Verse; chapter: Chapter };
  match: QuranSearchResult | undefined;
  onClick: () => void;
  bookmark?: boolean;
  color?: "primary" | "gold";
  delay?: number;
}) {
  const accentClass = color === "gold" ? "bg-gold-soft text-gold-strong" : "bg-primary-soft text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className="verse-card animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${accentClass}`}>
          {resolved.chapter.name} · {resolved.verse.number}
        </span>
        {match?.matchedTopic && (
          <span className="text-[10px] font-bold text-gold-strong">{match.matchedTopic}</span>
        )}
        {bookmark && <Bookmark size={13} className="text-gold-strong" fill="currentColor" />}
      </div>
      <VerseText text={resolved.verse.text} className="text-base leading-[2.1]" />
    </button>
  );
}

function TopicEmpty({ t }: { t: (key: string) => string }) {
  return (
    <Card className="py-8 text-center animate-fade-up">
      <p className="text-[11px] text-muted">{t("library.selectTopic")}</p>
    </Card>
  );
}

const FEATURE_TONES = {
  gold: "bg-gold-soft text-gold-strong",
  teal: "bg-primary-soft text-primary-ink",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
} as const;

/**
 * One tile in the "daily essentials" grid.
 *
 * `onPress` is optional so a card can never render as a button that does
 * nothing; a tile without one is a plain non-interactive surface.
 */
function WideCard({
  icon,
  title,
  sub,
  onPress,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onPress: () => void;
  delay?: number;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{ animationDelay: `${delay}ms` }}
      className="flex w-full items-center gap-3 rounded-[22px] border border-gold/30 bg-gold-soft p-4 text-start shadow-sm transition active:scale-[0.99] animate-fade-up"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-ink">{title}</span>
        {sub && <span className="mt-0.5 block text-[10px] leading-4 text-muted">{sub}</span>}
      </span>
      <ChevronLeft size={16} className="shrink-0 text-gold-strong rtl:rotate-180" />
    </button>
  );
}

function FeatureCard({
  icon,
  tone,
  title,
  subtitle,
  badge,
  done = false,
  onPress,
}: {
  icon: React.ReactNode;
  tone: keyof typeof FEATURE_TONES;
  title: string;
  subtitle: string;
  badge?: string;
  done?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${FEATURE_TONES[tone]}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-black text-ink">{title}</span>
          {done && <Check size={14} strokeWidth={3} className="shrink-0 text-success" />}
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-muted">{subtitle}</span>
      </span>
      {badge && (
        <span className="mt-2 w-full rounded-full bg-surface-2 px-2 py-1 text-center text-[9px] font-black text-muted">
          {badge}
        </span>
      )}
    </>
  );

  const className = `flex flex-col items-start gap-2.5 rounded-[22px] border border-line bg-surface p-4 text-start shadow-sm transition ${
    onPress ? "active:scale-[0.97]" : ""
  }`;

  if (!onPress) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" onClick={onPress} className={className}>
      {body}
    </button>
  );
}
