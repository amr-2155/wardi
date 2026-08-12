"use client";

import { BookOpen, ChevronDown, Compass, HeartHandshake, Lightbulb, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TafsirEntry } from "@/lib/quran/types";

export function TafsirSections({ tafsir }: { tafsir: TafsirEntry }) {
  const [openKey, setOpenKey] = useState<string | null>("meaning");

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

  return (
    <div className="flex flex-col gap-2">
      <AccordionItem
        label="المعنى الميسر"
        note={`من ${tafsir.tafsirSource}`}
        icon={BookOpen}
        open={openKey === "meaning"}
        onToggle={() => toggle("meaning")}
      >
        <p className="text-sm leading-7 text-ink">{tafsir.simplifiedMeaning}</p>
      </AccordionItem>
      <AccordionItem
        label="بمعنى أبسط"
        note="صياغة معاصرة مساعدة"
        icon={Lightbulb}
        open={openKey === "simpler"}
        onToggle={() => toggle("simpler")}
      >
        <p className="text-sm leading-7 text-ink">{tafsir.simplerMeaning}</p>
      </AccordionItem>
      <AccordionItem
        label="كيف أعيش بها؟"
        note="تطبيق عملي"
        icon={HeartHandshake}
        open={openKey === "live"}
        onToggle={() => toggle("live")}
      >
        <ul className="flex flex-col gap-2">
          {tafsir.howToLive.map((point, i) => (
            <li key={i} className="flex gap-2 text-sm leading-7 text-ink">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-strong" />
              {point}
            </li>
          ))}
        </ul>
      </AccordionItem>
      <AccordionItem
        label="وقفة للتدبر"
        note="سؤال للتأمل"
        icon={Compass}
        open={openKey === "reflect"}
        onToggle={() => toggle("reflect")}
      >
        <p className="font-quran text-sm leading-7 text-primary">{tafsir.reflection}</p>
      </AccordionItem>

      <div className="mt-1 flex items-start gap-1.5 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-[10px] leading-5 text-muted">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" />
        <p>
          «المعنى الميسر» مُلخّص من {tafsir.tafsirSource} بمراجعة موضوعية يدوية. أقسام «بمعنى أبسط»
          و«كيف أعيش بها؟» و«وقفة للتدبر» صياغة مساعدة للفهم، وليست تفسيرًا منقولًا عن مفسِّر معيّن.
        </p>
      </div>
    </div>
  );
}

function AccordionItem({
  label,
  note,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  note: string;
  icon: typeof BookOpen;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-colors ${
        open ? "border-gold/40 bg-gold-soft/40" : "border-line bg-surface"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 p-3.5 text-right"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
            open ? "bg-gold-soft text-gold-strong" : "bg-surface-2 text-muted"
          }`}
        >
          <Icon size={15} />
        </span>
        <span className="flex-1">
          <span className="block text-xs font-black">{label}</span>
          <span className="block text-[10px] text-muted">{note}</span>
        </span>
        <ChevronDown
          size={15}
          className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="animate-fade-up px-4 pb-4">{children}</div>}
    </div>
  );
}
