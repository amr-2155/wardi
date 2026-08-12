"use client";

import { Minus, Plus, X } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-3xl border border-line bg-surface shadow-sm ${className}`}>
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
      className="flex w-full items-center gap-3 text-right disabled:opacity-50"
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
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDec}
        disabled={decDisabled}
        aria-label="إنقاص"
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
        aria-label="زيادة"
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg animate-sheet-up rounded-t-3xl bg-surface p-5 pb-8 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-2 text-muted"
          >
            <X size={18} />
          </button>
        </div>
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
  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="رجوع"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-ink shadow-sm transition active:scale-95"
      >
        <X size={18} className="rotate-180" />
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
