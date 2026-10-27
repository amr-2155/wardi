"use client";

import { ArrowLeft, Minus, Plus, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useId, useRef } from "react";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { useLocale } from "@/lib/locale";

export function Card({
  className = "",
  children,
  style,
}: {
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={`rounded-3xl border border-line bg-surface shadow-sm ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] font-bold text-muted">{children}</p>;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-start disabled:opacity-50"
    >
      <span className="flex-1">
        <span className="block text-sm font-bold">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] text-muted">{description}</span>}
      </span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-primary" : "bg-surface-2"
        }`}
      >
        <span
          className={`h-6 w-6 rounded-full bg-white shadow transition-all ${
            checked ? "ms-auto" : ""
          }`}
        />
      </span>
    </button>
  );
}

export function Stepper({
  value,
  unit,
  onDec,
  onInc,
  decDisabled = false,
  incDisabled = false,
}: {
  value: number;
  unit?: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDec}
        disabled={decDisabled}
        aria-label={t("ui.decrease")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink transition active:scale-95 disabled:opacity-40"
      >
        <Minus size={18} />
      </button>
      <div className="flex-1 text-center">
        <p className="text-xl font-black leading-none">{value}</p>
        {unit && <p className="mt-1 text-[10px] text-muted">{unit}</p>}
      </div>
      <button
        type="button"
        onClick={onInc}
        disabled={incDisabled}
        aria-label={t("ui.increase")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white transition active:scale-95 disabled:opacity-40"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? min : Number(e.target.value))}
        className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-9 flex-1 rounded-xl text-xs font-bold transition ${
            value === option.value
              ? "bg-surface text-primary shadow"
              : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
children: ReactNode;
  }) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogA11y(open, onClose, panelRef);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      {/* Presentational: the panel below is the control surface. A button here
          would put a focusable element behind the dialog for the focus trap to
          fight, and screen readers announce the backdrop as a second control. */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-lg animate-sheet-up overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-5 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-base font-black">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ui.close")}
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-muted transition active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Full-width bottom sheet used by the mushaf reader.
 *
 * Same a11y contract as `Sheet` — Escape, trapped focus, focus restore, scroll
 * lock, `aria-labelledby` — but the reader's own chrome: a wider panel, a
 * blurred backdrop, and a `dir` the caller controls so the sheet can be opened
 * LTR while the app chrome around it is RTL.
 *
 * The reader previously hand-rolled this markup ten times, and every copy
 * declared itself to no one: no dialog role, no accessible name, and no way to
 * dismiss with a keyboard. All ten now route through here.
 */
export function ReaderSheet({
  label,
  onClose,
  dir,
  panelClassName,
  children,
}: {
  /** Accessible name. Rendered visually hidden so the caller's own visible
      heading keeps its own markup; a screen reader still announces it first. */
  label: string;
  onClose: () => void;
  dir: "rtl" | "ltr";
  /** Overrides the panel box. The reader has two shapes: a plain scrolling
      sheet and a flex-column sheet with its own max height and internal
      scroll area. */
  panelClassName?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  useDialogA11y(true, onClose, panelRef);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
        className={
          panelClassName ??
          "animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
        }
      >
        <h2 id={labelId} className="sr-only">
          {label}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ScreenHeader({
  title,
  onBack,
  subtitle,
}: {
  title: string;
  onBack: () => void;
subtitle?: string;
  }) {
  const { t } = useLocale();
  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("ui.back")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-ink shadow-sm transition active:scale-95"
      >
        <ArrowLeft size={18} className="rtl:rotate-180" />
      </button>
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-gold-soft px-3 py-1 text-[10px] font-bold text-gold-strong">
      {children}
    </span>
  );
}
