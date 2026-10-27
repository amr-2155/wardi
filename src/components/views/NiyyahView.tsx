"use client";

import { Heart, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, ScreenHeader, Sheet } from "@/components/ui";
import { NIYYAH_CATEGORIES } from "@/data/niyyah";
import { loadNiyyahItems, saveNiyyahItems, type NiyyahItem } from "@/lib/adhkarStore";
import { useLocale } from "@/lib/locale";

export function NiyyahView({ onBack }: { onBack: () => void }) {
  const { locale, t } = useLocale();
  const [items, setItems] = useState<NiyyahItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe load */
  useEffect(() => {
    setItems(loadNiyyahItems());
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Before the load above has run, `items` is still the empty initial state.
     Saving it would write "[]" over the stored intentions; if the app is killed
     in that window the data is gone. Same guard AdhkarView uses. */
  useEffect(() => {
    if (!loaded) return;
    saveNiyyahItems(items);
  }, [items, loaded]);

  /* Equal timestamps must compare equal: the old comparator returned -1 in both
     directions, so two quick-adds in the same millisecond sorted differently
     depending on the engine's sort. */
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1
      ),
    [items]
  );

  const addWithExample = (categoryId: string) => {
    const category = NIYYAH_CATEGORIES.find((c) => c.id === categoryId);
    const example = (locale === "ar" ? category?.exampleAr : category?.exampleEn) ?? "";
    if (!example) return;
    const item: NiyyahItem = {
      id: crypto.randomUUID(),
      title: example,
      note: "",
      category: categoryId,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [item, ...prev]);
  };

  const removeItem = (item: NiyyahItem) => {
    const ok = window.confirm(t("niyyah.deleteConfirm"));
    if (!ok) return;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 animate-fade-slide-up">
      <header className="animate-fade-up" style={{ animationDelay: "0ms" }}>
        <ScreenHeader title={t("niyyah.title")} subtitle={t("niyyah.subtitle")} onBack={onBack} />
      </header>

      {/* ADD */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="btn btn-primary mt-5 w-full animate-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <Plus size={17} /> {t("niyyah.add")}
      </button>

      {/* QUICK ADD — suggested examples */}
      <p className="mb-2 mt-5 text-xs font-bold text-muted animate-fade-up" style={{ animationDelay: "100ms" }}>
        {t("niyyah.quickAdd")}
      </p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 animate-fade-up" style={{ animationDelay: "140ms" }}>
        {NIYYAH_CATEGORIES.map((category) => {
          const example = locale === "ar" ? category.exampleAr : category.exampleEn;
          if (!example) return null;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => addWithExample(category.id)}
              className="shrink-0 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs font-bold text-ink shadow-sm transition hover:bg-primary-soft hover:text-primary active:scale-95"
            >
              + {locale === "ar" ? category.titleAr : category.titleEn}
            </button>
          );
        })}
      </div>

      {/* LIST */}
      {sorted.length === 0 ? (
        <Card className="mt-10 p-10 text-center text-muted animate-fade-up">
          <Target size={30} className="mx-auto mb-3 text-gold-strong" />
          <p className="text-sm font-bold text-ink">{t("niyyah.empty")}</p>
          <p className="mx-auto mt-2 max-w-[260px] text-xs leading-5">{t("niyyah.emptyHint")}</p>
        </Card>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {sorted.map((item, i) => (
            <NiyyahCard
              key={item.id}
              item={item}
              onEdit={() => setEditingId(item.id)}
              onDelete={() => removeItem(item)}
              delay={i * 40}
            />
          ))}
        </div>
      )}

      <Sheet
        open={creating || editingId !== null}
        onClose={() => {
          setCreating(false);
          setEditingId(null);
        }}
        title={creating ? t("niyyah.new") : t("niyyah.edit")}
      >
        <NiyyahEditor
          key={editingId ?? "new"}
          initial={editingId ? sorted.find((it) => it.id === editingId) ?? null : null}
          onSave={(title, note, category) => {
            if (editingId) {
              /* If the row vanished under the editor (deleted from another
                 surface, or trimmed by the cap) the old map matched nothing and
                 the sheet closed with no change and no error. Drop the stale
                 id instead of pretending the edit was saved. */
              if (!items.some((it) => it.id === editingId)) {
                setEditingId(null);
                return;
              }
              setItems((prev) =>
                prev.map((it) => (it.id === editingId ? { ...it, title, note, category } : it))
              );
            } else {
              const item: NiyyahItem = {
                id: crypto.randomUUID(),
                title,
                note,
                category,
                createdAt: new Date().toISOString(),
              };
              setItems((prev) => [item, ...prev]);
            }
            setCreating(false);
            setEditingId(null);
          }}
          onCancel={() => {
            setCreating(false);
            setEditingId(null);
          }}
        />
      </Sheet>
    </div>
  );
}

function NiyyahCard({
  item,
  onEdit,
  onDelete,
  delay,
}: {
  item: NiyyahItem;
  onEdit: () => void;
  onDelete: () => void;
  delay: number;
}) {
  const { locale, t } = useLocale();
  const category = NIYYAH_CATEGORIES.find((c) => c.id === item.category);
  const date = new Date(item.createdAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", {
    day: "numeric",
    month: "short",
  });

  return (
    <Card className="p-4 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {category ? (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-black text-primary">
                {locale === "ar" ? category.titleAr : category.titleEn}
              </span>
            ) : (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black text-muted">
                {t("niyyah.other")}
              </span>
            )}
            <span className="text-[11px] text-muted">{date}</span>
          </div>
          <p className="text-sm font-black leading-6 text-ink">{item.title}</p>
          {item.note && <p className="mt-1 text-xs leading-5 text-muted">{item.note}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("niyyah.edit")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted transition hover:text-primary active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("niyyah.delete")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger-soft text-danger transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function NiyyahEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: NiyyahItem | null;
  onSave: (title: string, note: string, category: string) => void;
  onCancel: () => void;
}) {
  const { locale, t } = useLocale();
  const [category, setCategory] = useState(initial?.category ?? NIYYAH_CATEGORIES[0].id);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onSave(trimmed, note.trim(), category);
      }}
    >
      <div>
        <p className="mb-1.5 text-xs font-black uppercase tracking-wider text-muted">
          {t("niyyah.category")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {NIYYAH_CATEGORIES.map((c) => {
            const label = locale === "ar" ? c.titleAr : c.titleEn;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                  category === c.id
                    ? "bg-primary text-white"
                    : "bg-surface-2 text-ink hover:bg-primary-soft hover:text-primary"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted">
          {t("niyyah.titleLabel")}
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("niyyah.titlePlaceholder")}
          autoFocus
          className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-ink outline-none transition focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted">
          {t("niyyah.note")}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("niyyah.notePlaceholder")}
          rows={3}
          className="w-full resize-none rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-ink outline-none transition focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="btn btn-primary h-12 flex-1 disabled:opacity-40"
        >
          <Heart size={16} /> {t("niyyah.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("niyyah.cancel")}
          className="btn-icon h-12 w-12"
        >
          <X size={18} />
        </button>
      </div>
    </form>
  );
}