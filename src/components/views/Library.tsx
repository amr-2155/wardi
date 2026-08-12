"use client";

import { Bookmark, BookOpen, Clock3, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { VerseText } from "@/components/quran";
import { TOPICS } from "@/data/quran";
import type { QuranData } from "@/hooks/useQuran";
import { DATASET_META } from "@/lib/quran/store";

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
  const [query, setQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [section, setSection] = useState<"search" | "bookmarks">("search");

  const results = useMemo(() => quran.search(query, 40), [quran, query]);

  const topicVerses = useMemo(() => {
    const topic = selectedTopic ? topics.find((t) => t.name === selectedTopic) : null;
    return topic ? topic.ayahs : [];
  }, [selectedTopic]);

  const dailyAyah = quran.getAyah(quran.daily?.ref ?? "");
  const dailyVisible = quran.dailyReady && dailyAyah;

  const showResults = query.trim().length > 0 || (selectedTopic && topicVerses.length > 0);
  const listRefs = query.trim().length > 0 ? results.map((r) => r.ref) : topicVerses;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32">
      {/* HEADER */}
      <header className="flex items-center gap-2 pb-4 pt-6">
        <BookOpen size={22} className="text-gold-strong" />
        <div>
          <h1 className="text-2xl font-black">المكتبة</h1>
          <p className="text-[11px] text-muted">آيات القرآن — بحث وتدبر</p>
        </div>
      </header>

      {/* DAILY AYAH */}
      {dailyVisible && dailyAyah && (
        <button
          type="button"
          onClick={onOpenDaily}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-3 text-right shadow-sm transition active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep">
            <Sparkles size={17} />
          </span>
          <span className="flex-1">
            <span className="block text-[11px] font-bold">آية اليوم — من وردك</span>
            <span className="mt-0.5 block text-[10px] text-muted">
              {dailyAyah.chapter.name} · الآية {dailyAyah.verse.number}
            </span>
          </span>
          <span className="rounded-full bg-surface px-3 py-1.5 text-[10px] font-black text-gold-strong shadow-sm">
            افتح التدبر
          </span>
        </button>
      )}

      {/* SECTIONS */}
      <div className="mt-4 flex gap-1 rounded-2xl bg-surface-2 p-1">
        <SectionTab
          active={section === "search"}
          label="بحث ومواضيع"
          onClick={() => setSection("search")}
        />
        <SectionTab
          active={section === "bookmarks"}
          label={`محفوظاتي (${quran.bookmarks.length})`}
          onClick={() => setSection("bookmarks")}
        />
      </div>

      {section === "search" ? (
        <>
          {/* SEARCH */}
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
            <Search size={17} className="shrink-0 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في نص القرآن..."
              className="w-full bg-transparent text-sm font-bold outline-none placeholder:font-normal placeholder:text-muted"
            />
          </div>

          {/* TOPICS */}
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold text-muted">تصفح بالموضوع</p>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTopic(selectedTopic === t.name ? null : t.name);
                    setQuery("");
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                    selectedTopic === t.name
                      ? "bg-primary text-white"
                      : "bg-surface-2 text-ink"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* RESULTS */}
          <div className="mt-5 flex flex-col gap-2.5">
            {query.trim().length > 0 && (
              <p className="text-[11px] text-muted">
                {results.length > 0
                  ? `${results.length} نتيجة لـ «${query}»`
                  : `لا توجد نتائج لـ «${query}»`}
              </p>
            )}
            {selectedTopic && !showResults && <TopicEmpty />}
            {showResults &&
              (listRefs.length > 0 ? (
                listRefs.map((ref) => {
                  const resolved = quran.getAyah(ref);
                  if (!resolved) return null;
                  const match = results.find((r) => r.ref === ref);
                  return (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => onOpenAyah(ref)}
                      className="rounded-2xl border border-line bg-surface p-4 text-right shadow-sm transition active:scale-[0.99]"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-black text-primary">
                          {resolved.chapter.name} · {resolved.verse.number}
                        </span>
                        {match?.matchedTopic && (
                          <span className="text-[10px] font-bold text-gold-strong">
                            {match.matchedTopic}
                          </span>
                        )}
                      </div>
                      <VerseText
                        text={resolved.verse.text}
                        className="text-base leading-[2.1]"
                      />
                    </button>
                  );
                })
              ) : (
                <TopicEmpty />
              ))}
          </div>
        </>
      ) : (
        <>
          {/* BOOKMARKS */}
          {quran.bookmarks.length === 0 ? (
            <div className="mt-10 flex flex-col items-center gap-2 text-center">
              <Bookmark size={28} className="text-muted" />
              <p className="text-sm font-bold">لا توجد محفوظات بعد</p>
              <p className="max-w-[240px] text-[11px] text-muted">
                احفظ آيات تهمك من أي تدبر وسوف تظهر هنا.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2.5">
              {quran.bookmarks.map((ref) => {
                const resolved = quran.getAyah(ref);
                if (!resolved) return null;
                return (
                  <button
                    key={ref}
                    type="button"
                    onClick={() => onOpenAyah(ref)}
                    className="rounded-2xl border border-line bg-surface p-4 text-right shadow-sm transition active:scale-[0.99]"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-[10px] font-black text-gold-strong">
                        {resolved.chapter.name} · {resolved.verse.number}
                      </span>
                      <Bookmark size={13} className="text-gold-strong" fill="currentColor" />
                    </div>
                    <VerseText text={resolved.verse.text} className="text-base leading-[2.1]" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-muted">
        <Clock3 size={12} />
        يعمل بدون إنترنت — النص من {DATASET_META.source}
      </div>
    </div>
  );
}

function SectionTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 flex-1 rounded-xl text-xs font-bold transition ${
        active ? "bg-surface text-primary shadow" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function TopicEmpty() {
  return <p className="py-8 text-center text-[11px] text-muted">اختر موضوعًا لعرض آياته.</p>;
}
