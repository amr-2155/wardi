"use client";

import { Bookmark, BookOpen, Clock3, Search, Sparkles } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Card, SegmentControl } from "@/components/ui";
import { VerseText } from "@/components/quran";
import { TOPICS } from "@/data/quran";
import { useLocale } from "@/lib/locale";
import type { QuranData } from "@/hooks/useQuran";
import type { Chapter, Verse, QuranSearchResult } from "@/lib/quran/types";
import { DATASET_META } from "@/lib/quran/store";
import { RecitersView } from "@/components/views/audio/RecitersView";
import { MiniPlayer } from "@/components/views/audio/MiniPlayer";

const topics = TOPICS;

export function LibraryView({
  quran,
  onOpenAyah,
  onOpenDaily,
}: {
  quran: QuranData;
  onOpenAyah: (ayahId: string) => void;
  onOpenDaily: () => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [section, setSection] = useState<"search" | "bookmarks">("search");
  const [subSection, setSubSection] = useState<"verses" | "audio">("verses");

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

  const showResults = deferredQuery.trim().length > 0 || (selectedTopic && topicVerses.length > 0);
  const listRefs = deferredQuery.trim().length > 0 ? results.map((r) => r.ref) : topicVerses;

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

      {/* DAILY AYAH */}
      {dailyVisible && dailyAyah && (
        <button
          type="button"
          onClick={onOpenDaily}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-gold/30 bg-gold-soft p-4 text-right shadow-md transition hover:border-gold/50 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep ring-2 ring-gold/30">
            <Sparkles size={19} />
          </span>
          <span className="flex-1">
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

      {/* SECTIONS */}
      <div className="mt-5">
        <SegmentControl<"search" | "bookmarks">
          options={[
            { value: "search", label: t("library.searchTab") },
            { value: "bookmarks", label: `${t("library.bookmarksTab")} (${quran.bookmarks.length})` },
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
              { value: "verses", label: t("library.searchTab") },
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

            {/* RESULTS */}
            <div className="mt-5 flex flex-col gap-2.5">
              {deferredQuery.trim().length > 0 && (
                <p className="text-[11px] text-muted">
                  {results.length > 0
                    ? `${results.length} ${t("library.resultsFor")} «${deferredQuery}»`
                    : `${t("library.noResults")} «${deferredQuery}»`}
                </p>
              )}
              {selectedTopic && !showResults && <TopicEmpty t={t} />}
              {showResults &&
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
      ) : (
        // BOOKMARKS
        <>
          {quran.bookmarks.length === 0 ? (
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
