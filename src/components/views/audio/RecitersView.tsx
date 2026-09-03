"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { useLocale } from "@/lib/locale";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { SurahListView } from "./SurahListView";

/**
 * RecitersView — the first step of the audio UX.
 * Shows a list of reciters fetched from the Quran.com API,
 * with a search box that filters by Arabic and English names.
 * The user selects a reciter, which then reveals the SurahListView.
 */
export function RecitersView() {
  const { t } = useLocale();
  const {
    reciters,
    recitersLoading,
    error,
    currentReciter,
    actions: { loadReciters, selectReciter },
  } = useAudioPlayer();

  const [search, setSearch] = useState("");

  useEffect(() => {
    if (reciters.length === 0 && !recitersLoading) {
      void loadReciters();
    }
  }, [reciters, recitersLoading, loadReciters]);

  // Filter by both Arabic and English name.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reciters;
    return reciters.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.englishName.toLowerCase().includes(q)
    );
  }, [reciters, search]);

  // If a reciter is selected, show the surah list.
  if (currentReciter) {
    return <SurahListView onBack={() => selectReciter("")} />;
  }


  if (recitersLoading) {
    return (
      <div className="space-y-2">
        <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
          <div className="h-12 w-full animate-pulse rounded-2xl border border-line bg-surface" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-line bg-surface"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mt-10 p-10 text-center text-muted animate-fade-up">
        <p className="text-sm">{error}</p>
        <button
          type="button"
          onClick={() => {
            void loadReciters();
          }}
          className="btn btn-ghost btn-lg mt-4"
        >
          {t("audio.retry")}
        </button>
      </Card>
    );
  }

  if (!filtered.length) {
    return (
      <Card className="mt-10 p-10 text-center text-muted animate-fade-up">
        <p className="text-sm">{t("audio.noReciters")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search
          size={17}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("audio.searchPlaceholder")}
          className="w-full rounded-2xl border border-line bg-surface px-4 py-2.5 pr-3 pl-10 text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted focus-within:border-gold/40"
          aria-label={t("audio.searchPlaceholder")}
        />
      </div>

      {/* Reciter list */}
      <div className="mt-2 flex flex-col gap-1.5">
        {filtered.map((reciter, i) => {
          const isSelected = false;
          return (
            <button
              key={reciter.id}
              type="button"
              onClick={() => void selectReciter(reciter.id)}
              className={`flex items-center justify-between rounded-2xl border border-line bg-surface p-3.5 text-right transition animate-fade-up ${
                isSelected
                  ? "border-gold/50 bg-primary-soft"
                  : "hover:border-gold/30 hover:bg-surface-2"
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex flex-col items-end">
                <span className="text-sm font-black text-ink">
                  {reciter.name}
                </span>
                <span className="text-xs text-muted">
                  {reciter.englishName}
                  {reciter.style && (
                    <span className="mx-1">•</span>
                  )}
                  {reciter.style && (
                    <span className="text-[10px] text-muted">
                      {reciter.style === "murattal"
                        ? "مورتل"
                        : reciter.style === "mujawwad"
                        ? "مجوّد"
                        : "عادي"}
                    </span>
                  )}
                </span>
              </div>
              {isSelected && (
                <span className="text-[10px] font-black text-primary">
                  {t("audio.selected")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
