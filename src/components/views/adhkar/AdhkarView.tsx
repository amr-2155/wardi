"use client";

import {
  BadgeCheck,
  BedDouble,
  Check,
  ChevronLeft,
  Heart,
  Home,
  Landmark,
  MoonStar,
  Plane,
  Search,
  Sparkles,
  Sunrise,
  Sunset,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, ScreenHeader } from "@/components/ui";
import { DHIKR_CATEGORIES, getCategoryDhikr } from "@/data/adhkar";
import type { DhikrCategoryId, DhikrItem } from "@/data/adhkar";
import { DhikrReciter } from "@/components/views/adhkar/DhikrReciter";
import {
  bumpDhikrCount,
  loadAdhkarFavorites,
  loadSingleDhikrCount,
  saveAdhkarFavorites,
} from "@/lib/adhkarStore";
import { todayKey } from "@/lib/dates";
import { useLocale } from "@/lib/locale";

const CATEGORY_ICONS: Record<DhikrCategoryId, React.ComponentType<{ size?: number; className?: string }>> = {
  morning: Sunrise,
  evening: Sunset,
  sleep: MoonStar,
  wakeup: BedDouble,
  "after-prayer": BadgeCheck,
  home: Home,
  mosque: Landmark,
  food: UtensilsCrossed,
  travel: Plane,
  general: Sparkles,
};

export function AdhkarView({ onBack }: { onBack: () => void }) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<DhikrCategoryId | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe load */
  useEffect(() => {
    setFavorites(loadAdhkarFavorites());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    saveAdhkarFavorites(favorites);
  }, [favorites]);

  const toggleFavorite = (itemId: string) => {
    const next = new Set(favorites);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setFavorites([...next]);
  };

  const category = selected ? DHIKR_CATEGORIES.find((c) => c.id === selected) ?? null : null;
  const title = category ? (locale === "ar" ? category.titleAr : category.titleEn) : t("adhkar.title");
  const subtitle = category ? "" : t("adhkar.subtitle");

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 animate-fade-slide-up">
      <header className="animate-fade-up">
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          onBack={selected ? () => setSelected(null) : onBack}
        />
      </header>
      {selected ? (
        <AdhkarCategoryList
          key={selected}
          categoryId={selected}
          title={title}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <AdhkarHome favorites={favorites} onOpenCategory={(id) => setSelected(id)} />
      )}
    </div>
  );
}

function AdhkarHome({
  favorites,
  onOpenCategory,
}: {
  favorites: string[];
  onOpenCategory: (id: DhikrCategoryId) => void;
}) {
  const { locale, t } = useLocale();
  const favoriteIds = new Set(favorites);

  return (
    <>
      {DHIKR_CATEGORIES.filter((c) => getCategoryDhikr(c.id).length > 0).map((category, i) => {
        const items = getCategoryDhikr(category.id);
        const favoriteCount = items.filter((item) => favoriteIds.has(item.id)).length;
        const Icon = CATEGORY_ICONS[category.id];
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onOpenCategory(category.id)}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-sm transition hover:bg-surface-2 active:scale-[0.99] animate-fade-up focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong">
              <Icon size={20} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-black text-ink">
                {locale === "ar" ? category.titleAr : category.titleEn}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {items.length} {t("adhkar.items")}
                {favoriteCount > 0 ? ` · ${t("adhkar.favCount", { n: favoriteCount })}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-3 py-1.5 text-xs font-black text-gold-strong">
              {t("adhkar.open")}
              <ChevronLeft size={14} className="ltr:rotate-180" />
            </span>
          </button>
        );
      })}
    </>
  );
}

function AdhkarCategoryList({
  categoryId,
  title,
  favorites,
  onToggleFavorite,
}: {
  categoryId: DhikrCategoryId;
  title: string;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<DhikrItem[]>([]);
  const [reciting, setReciting] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- derive list once per category */
  useEffect(() => {
    setItems(getCategoryDhikr(categoryId));
  }, [categoryId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

  if (reciting) {
    return <DhikrReciter title={title} items={items} onExit={() => setReciting(false)} />;
  }

  const q = query.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (favoritesOnly && !favoriteIds.has(item.id)) return false;
    if (!q) return true;
    return [item.text, item.source, item.note ?? ""].some((s) => s.toLowerCase().includes(q));
  });

  return (
    <>
      {(categoryId === "morning" || categoryId === "evening") && (
        <button
          type="button"
          onClick={() => setReciting(true)}
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft p-4 text-start shadow-sm transition hover:bg-gold-soft/70 active:scale-[0.99] animate-fade-up"
          style={{ animationDelay: "40ms" }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep">
            <Sunrise size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-black text-ink">{t("adhkar.startRecite")}</span>
            <span className="mt-0.5 block text-xs font-bold text-ink">
              {t("adhkar.cardsCount", { n: items.length })}
            </span>
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-primary-deep">
            <ChevronLeft size={18} />
          </span>
        </button>
      )}
      <div
        className="mt-5 flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm animate-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <Search size={17} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("adhkar.searchPlaceholder")}
          className="w-full bg-transparent text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted"
          aria-label={t("adhkar.searchPlaceholder")}
        />
      </div>

      <div className="mt-3 flex gap-1.5 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
            favoritesOnly
              ? "bg-gold text-primary-deep"
              : "bg-surface-2 text-ink hover:bg-gold-soft hover:text-gold-strong"
          }`}
        >
          <Heart size={13} fill={favoritesOnly ? "currentColor" : "none"} />
          {t("adhkar.favorites")}
        </button>
        <span className="rounded-full bg-gold-soft px-3 py-1.5 text-xs font-bold text-gold-strong">
          {t("adhkar.dailyReset")}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {visible.length === 0 ? (
          <Card className="py-8 text-center text-muted animate-fade-up">
            <Search size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">{t("adhkar.noResults")}</p>
          </Card>
        ) : (
          visible.map((item, i) => (
            <DhikrCard
              key={item.id}
              item={item}
              isFavorite={favoriteIds.has(item.id)}
              onToggleFavorite={onToggleFavorite}
              delay={140 + i * 40}
            />
          ))
        )}
      </div>
    </>
  );
}

function DhikrCard({
  item,
  isFavorite,
  onToggleFavorite,
  delay,
}: {
  item: DhikrItem;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  delay: number;
}) {
  const { t } = useLocale();
  const target = item.count ?? 1;
  const isMulti = target > 1;
  const today = todayKey();
  const [current, setCurrent] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe load */
  useEffect(() => {
    setCurrent(loadSingleDhikrCount(item.id, today));
  }, [item.id, today]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const done = current >= target;

  const increment = () => {
    const next = Math.min(target, current + 1);
    setCurrent(next);
    bumpDhikrCount(item.id, today, next);
  };
  const resetItem = () => {
    setCurrent(0);
    bumpDhikrCount(item.id, today, 0);
  };

  return (
    <Card className="p-4 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-black text-gold-strong">
            {item.type === "quran" ? t("adhkar.quran") : t("adhkar.sunnah")}
          </span>
          {isMulti && (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black text-muted">
              ×{target}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(item.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? t("adhkar.unfavorite") : t("adhkar.favorite")}
          className={`shrink-0 rounded-xl p-2 transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            isFavorite ? "text-gold-strong" : "text-muted hover:text-gold-strong"
          }`}
        >
          <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <p
        className={`mt-3 break-words whitespace-pre-line ${
          item.type === "quran"
            ? "font-quran font-normal text-lg leading-[2.2] text-primary-ink"
            : "text-base font-bold leading-9 text-ink"
        }`}
      >
        {item.text}
      </p>

      {item.note && <p className="mt-2 break-words text-xs leading-6 text-muted">{item.note}</p>}

      <div className="mt-3 flex items-end justify-between gap-2 border-t border-line pt-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted">{t("adhkar.source")}</p>
          <p className="mt-0.5 break-words text-xs font-bold text-ink">{item.source}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-black text-gold-strong">
            {t(`adhkar.authenticity.${item.authenticity}`)}
          </span>
          {isMulti ? (
            <button
              type="button"
              onClick={increment}
              className={`flex h-12 min-w-16 flex-col items-center justify-center rounded-2xl px-3 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                done ? "bg-gold text-primary-deep" : "bg-gold text-primary-deep active:bg-gold-hover"
              }`}
            >
              <span className="text-sm font-black leading-none">{current}</span>
              <span className="mt-0.5 text-[10px] opacity-70">/ {target}</span>
            </button>
          ) : done ? (
            <button
              type="button"
              onClick={resetItem}
              aria-label={t("adhkar.doneToday")}
              className="flex h-12 w-14 items-center justify-center rounded-2xl bg-gold text-primary-deep transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Check size={20} strokeWidth={3} />
            </button>
          ) : (
            <button
              type="button"
              onClick={increment}
              aria-label={t("adhkar.markDone")}
               className="flex h-12 w-14 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong transition hover:bg-gold hover:text-primary-deep active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Check size={20} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}