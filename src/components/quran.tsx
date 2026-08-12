"use client";

import { Bookmark, Copy, ExternalLink, Share2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { RelatedAyah, RelationType } from "@/lib/quran/types";
import { DATASET_META } from "@/lib/quran/store";

export const RELATION_LABELS: Record<RelationType, string> = {
  theme: "سياق مشترك",
  topic: "نفس الموضوع",
  similar_context: "سياق متشابه",
  same_concept: "نفس المفهوم",
  related_story: "قصة ذات صلة",
  related_dua: "دعاء مرتبط",
  related_warning: "تحذير مرتبط",
  related_promise: "وعد مرتبط",
  related_attribute: "صفة مرتبطة",
};

export function SurahBadge({ name, count }: { name: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-black text-gold-strong">
        {name}
      </span>
      {typeof count === "number" && <span className="text-[10px] font-bold text-muted">{count}</span>}
    </div>
  );
}

export function VerseText({
  text,
  className = "text-xl sm:text-2xl leading-[2.3]",
}: {
  text: string;
  className?: string;
}) {
  return <p className={`font-quran ${className}`}>{text}</p>;
}

export function AyahMetaFooter() {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-surface-2 p-3 text-[10px] text-muted">
      <ShieldCheck size={14} className="shrink-0 text-success" />
      <p>
        نص قرآني موثوق من {DATASET_META.source} — موثّق بتاريخ {DATASET_META.verificationDate} ومتحقق
        منه بالبصمة الرقمية.
      </p>
    </div>
  );
}

export function AyahActionBar({
  isBookmarked,
  onToggleBookmark,
  onCopy,
  onShare,
}: {
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ActionButton label="حفظ" active={isBookmarked} onClick={onToggleBookmark}>
        <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} />
      </ActionButton>
      <ActionButton label="نسخ" onClick={onCopy}>
        <Copy size={16} />
      </ActionButton>
      <ActionButton label="مشاركة" onClick={onShare}>
        <Share2 size={16} />
      </ActionButton>
    </div>
  );
}

export function ActionButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border text-[11px] font-bold transition active:scale-95 ${
        active
          ? "border-gold/50 bg-gold-soft text-gold-strong"
          : "border-line bg-surface text-ink"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

export function RelatedItem({
  related,
  onOpen,
}: {
  related: RelatedAyah;
  onOpen: (ayahId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(related.ayah)}
      className="w-full rounded-2xl border border-line bg-surface p-3 text-right transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-black text-primary">
          {RELATION_LABELS[related.relationType]}
        </span>
        <ExternalLink size={13} className="text-muted" />
      </div>
      <p className="mt-2 font-quran text-base leading-[2]">{related.reason}</p>
      <p className="mt-1.5 text-[10px] text-muted">
        {related.ayah} · {related.source}
      </p>
    </button>
  );
}
