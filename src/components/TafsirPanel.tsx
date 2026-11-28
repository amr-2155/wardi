"use client";

import {
  AlignRight,
  BookOpen,
  Check,
  Compass,
  Copy,
  FileText,
  Heart,
  HeartHandshake,
  Info,
  ListTree,
  Scale,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { VerseText } from "@/components/quran";
import { useLocale } from "@/lib/locale";
import type { TafsirBenefit, TafsirResult } from "@/lib/tafsir";

type AvailableModel = Extract<TafsirResult, { status: "curated" | "generated" }>;

/**
 * Article-shaped tafsir renderer.
 *
 * Shows only the sections the reviewed entry actually has, and marks generated
 * output as draft so it is never mistaken for reviewed commentary. The verse
 * text is displayed from the resolved dataset context, never from the entry.
 */
export function TafsirPanel({ model }: { model: TafsirResult }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    []
  );

  if (model.status === "unavailable") return null;
  const available = model as AvailableModel;
  const { context, entry } = available;
  const generated = available.status === "generated";
  const published = entry.reviewStatus === "published";
  /* A draft is unreviewed wording under evaluation; it must carry the same
     caution styling as generated text and can never wear the reviewed badge. */
  const draft = entry.reviewStatus === "draft";

  const copyText = () => {
    const lines: string[] = [`${context.chapterName} — ${context.ayahNumber}`, `«${context.verseText}»`];
    lines.push(`${t("tafsir.sourceLabel")}: ${entry.sourceEdition}`);
    /* The copied/shared text leaves this screen, so it must carry the same
       honesty label as the panel — otherwise attribution is silently lost. */
    if (published) {
      lines.push(
        t("tafsir.publishedDisclaimer", {
          source: entry.sourceEdition,
          date: entry.sourceDate ?? "",
        })
      );
    }
    if (generated) lines.push(t("tafsir.generatedDisclaimer"));
    if (draft) lines.push(t("tafsir.draftDisclaimer"));
    if (entry.overview) lines.push(`${t("tafsir.section.overview")}: ${entry.overview}`);
    if (entry.vocabulary?.length) {
      lines.push(t("tafsir.section.vocabulary"));
      for (const v of entry.vocabulary) lines.push(`• ${v.term}: ${v.meaning}`);
    }
    if (entry.context) lines.push(`${t("tafsir.section.context")}: ${entry.context}`);
    if (entry.revelation) {
      lines.push(
        `${t("tafsir.section.revelation")}: ${
          entry.revelation.status === "none"
            ? t("tafsir.revelation.none")
            : entry.revelation.text ?? ""
        }`
      );
    }
    if (entry.detailed?.length) {
      lines.push(t("tafsir.section.detailed"));
      /* Published text is copied verbatim in the panel, so the export must not
         invent `1./2.` numbering that the source never had (upstream headings
         and bullet markers live inside these paragraphs). Reviewed/generated
         entries keep their original numbered formatting. */
      entry.detailed.forEach((p, i) => lines.push(published ? p : `${i + 1}. ${p}`));
    }
    if (entry.practice?.length) {
      lines.push(t("tadabbur.section.live"));
      entry.practice.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    }
    if (entry.benefits?.length) {
      lines.push(t("tafsir.section.benefits"));
      for (const b of entry.benefits) {
        lines.push(`• ${benefitLabel(b, t)}: ${b.text}`);
      }
    }
    if (entry.scholars?.summary) lines.push(`${t("tafsir.section.scholars")}: ${entry.scholars.summary}`);
    if (entry.scholars?.views?.length) {
      for (const v of entry.scholars.views) {
        lines.push(`• ${v.view}${v.evidence ? " — " + v.evidence : ""}`);
      }
    }
    if (entry.application) {
      lines.push(t("tafsir.section.application"));
      const app = entry.application;
      if (app.personal) lines.push(`• ${t("tafsir.application.personal")}: ${app.personal}`);
      if (app.family) lines.push(`• ${t("tafsir.application.family")}: ${app.family}`);
      if (app.work) lines.push(`• ${t("tafsir.application.work")}: ${app.work}`);
      if (app.social) lines.push(`• ${t("tafsir.application.social")}: ${app.social}`);
    }
    if (entry.reflection?.length) {
      lines.push(t("tafsir.section.reflection"));
      entry.reflection.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    }
    if (entry.dua) lines.push(`${t("tafsir.section.dua")}: ${entry.dua}`);
    if (entry.summary) lines.push(`${t("tafsir.section.summary")}: ${entry.summary}`);
    return lines.join("\n");
  };

  const markCopied = () => {
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = null;
      setCopied(false);
    }, 1600);
  };

  /* Clipboard access is unavailable on insecure origins and can reject even
     when present (permission denied, WebView quirks). A failed copy must not
     throw an unhandled rejection or claim success. */
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    if (await copyToClipboard(copyText())) markCopied();
  };

  const handleShare = async () => {
    const text = copyText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // cancelled or unsupported: fall back to copying
      }
    }
    if (await copyToClipboard(text)) markCopied();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* VERSE (canonical) */}
      <div className="rounded-2xl border border-gold/30 bg-surface p-4 text-center">
        <VerseText text={context.verseText} className="text-lg leading-[2.2]" />
        <p className="mt-2 text-[11px] font-bold text-muted">
          {t("tadabbur.verseOf", { name: context.chapterName, number: context.ayahNumber })}
        </p>
      </div>

      {/* REVIEW STATUS */}
      <div
        className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[11px] leading-5 ${
          generated || published || draft
            ? "border-gold/40 bg-gold-soft/40 text-ink"
            : "border-success/30 bg-surface-2 text-muted"
        }`}
      >
        {generated || draft ? (
          <Info size={13} className="mt-0.5 shrink-0 text-gold-strong" />
        ) : published ? (
          <BookOpen size={13} className="mt-0.5 shrink-0 text-gold-strong" />
        ) : (
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" />
        )}
        <span>
          {generated
            ? t("tafsir.badge.generated")
            : draft
              ? t("tafsir.badge.draft")
              : published
                ? t("tafsir.badge.published")
                : t("tafsir.badge.reviewed")}
          <span className="mt-1 block text-[10px] opacity-80">
            {generated
              ? t("tafsir.badge.generatedHint")
              : draft
                ? `${entry.sourceEdition}`
                : published
                  ? t("tafsir.badge.publishedHint", {
                      edition: entry.sourceEdition,
                      date: entry.sourceDate ?? "",
                    })
                  : `${entry.sourceEdition} · ${t("tafsir.badge.reviewedOn", { date: entry.reviewedDate ?? "" })}`}
          </span>
        </span>
      </div>

      {entry.overview && (
        <Section icon={BookOpen} title={t("tafsir.section.overview")}>
          <p className="text-sm leading-7 text-ink">{entry.overview}</p>
        </Section>
      )}

      {entry.vocabulary && entry.vocabulary.length > 0 && (
        <Section icon={ListTree} title={t("tafsir.section.vocabulary")}>
          <dl className="flex flex-col gap-2">
            {entry.vocabulary.map((v, i) => (
              <div key={i} className="rounded-xl bg-surface-2 px-3 py-2">
                <dt className="text-xs font-black text-primary">{v.term}</dt>
                <dd className="mt-0.5 text-[11px] leading-6 text-ink">{v.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {entry.context && (
        <Section icon={AlignRight} title={t("tafsir.section.context")}>
          <p className="text-sm leading-7 text-ink">{entry.context}</p>
        </Section>
      )}

      {entry.revelation && (
        <Section icon={Info} title={t("tafsir.section.revelation")}>
          {entry.revelation.status === "none" ? (
            <p className="text-[11px] leading-6 text-muted">{t("tafsir.revelation.none")}</p>
          ) : (
            <p className="text-sm leading-7 text-ink">{entry.revelation.text}</p>
          )}
        </Section>
      )}

      {entry.detailed && entry.detailed.length > 0 && (
        <Section icon={ScrollText} title={t("tafsir.section.detailed")}>
          <div className="flex flex-col gap-2">
            {entry.detailed.map((p, i) => (
              <p key={i} className="text-sm leading-7 text-ink">
                {p}
              </p>
            ))}
          </div>
        </Section>
      )}

      {entry.practice && entry.practice.length > 0 && (
        <Section icon={FileText} title={t("tadabbur.section.live")}>
          <ul className="flex flex-col gap-2">
            {entry.practice.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm leading-7 text-ink">
                <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-strong" />
                {step}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {entry.benefits && entry.benefits.length > 0 && (
        <Section icon={Sparkles} title={t("tafsir.section.benefits")}>
          <ul className="flex flex-col gap-2">
            {entry.benefits.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-7 text-ink">
                <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-strong" />
                <span>
                  <span className="font-black text-primary">{benefitLabel(b, t)}: </span>
                  {b.text}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {entry.scholars && (entry.scholars.summary || entry.scholars.views?.length) && (
        <Section icon={Scale} title={t("tafsir.section.scholars")}>
          {entry.scholars.summary && (
            <p className="text-sm leading-7 text-ink">{entry.scholars.summary}</p>
          )}
          {entry.scholars.views && entry.scholars.views.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {entry.scholars.views.map((v, i) => (
                <li key={i} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-primary">{v.view}</span>
                    {v.strength === "stronger" && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-black text-success">
                        {t("tafsir.scholar.stronger")}
                      </span>
                    )}
                  </div>
                  {v.evidence && (
                    <p className="mt-1 text-[11px] leading-6 text-muted">{v.evidence}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {entry.application && (
        <Section icon={HeartHandshake} title={t("tafsir.section.application")}>
          <div className="flex flex-col gap-2">
            {entry.application.personal && (
              <ApplicationRow label={t("tafsir.application.personal")} text={entry.application.personal} />
            )}
            {entry.application.family && (
              <ApplicationRow label={t("tafsir.application.family")} text={entry.application.family} />
            )}
            {entry.application.work && (
              <ApplicationRow label={t("tafsir.application.work")} text={entry.application.work} />
            )}
            {entry.application.social && (
              <ApplicationRow label={t("tafsir.application.social")} text={entry.application.social} />
            )}
          </div>
        </Section>
      )}

      {entry.reflection && entry.reflection.length > 0 && (
        <Section icon={Compass} title={t("tafsir.section.reflection")}>
          <ol className="flex list-decimal flex-col gap-2 ps-5">
            {entry.reflection.map((q, i) => (
              <li key={i} className="text-sm leading-7 text-primary">
                {q}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.dua && (
        <Section icon={Heart} title={t("tafsir.section.dua")}>
          <p className="font-quran text-sm leading-8 text-primary">{entry.dua}</p>
        </Section>
      )}

      {entry.summary && (
        <Section icon={FileText} title={t("tafsir.section.summary")}>
          <p className="text-sm leading-7 text-ink">{entry.summary}</p>
        </Section>
      )}

      {/* ACTIONS */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-[11px] font-bold text-ink transition active:scale-95"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          {copied ? t("tafsir.action.copied") : t("tafsir.action.copy")}
        </button>
        <button
          type="button"
          onClick={() => void handleShare()}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-[11px] font-bold text-ink transition active:scale-95"
        >
          <Share2 size={14} />
          {t("tafsir.action.share")}
        </button>
      </div>

      <div className="flex items-start gap-1.5 rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-[10px] leading-5 text-muted">
        {generated || draft ? (
          <Info size={13} className="mt-0.5 shrink-0 text-gold-strong" />
        ) : published ? (
          <BookOpen size={13} className="mt-0.5 shrink-0 text-gold-strong" />
        ) : (
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" />
        )}
        <p>
          {generated
            ? t("tafsir.generatedDisclaimer")
            : draft
              ? t("tafsir.draftDisclaimer")
              : published
                ? t("tafsir.publishedDisclaimer", {
                    source: entry.sourceEdition,
                    date: entry.sourceDate ?? "",
                  })
                : t("tafsir.richDisclaimer", { source: entry.sourceEdition })}
        </p>
      </div>
    </div>
  );
}

function benefitLabel(b: TafsirBenefit, t: (key: string) => string): string {
  return t(`tafsir.benefit.${b.category}`);
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-strong">
          <Icon size={14} />
        </span>
        <h4 className="text-xs font-black text-ink">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function ApplicationRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="text-[11px] font-black text-primary">{label}</p>
      <p className="mt-0.5 text-[11px] leading-6 text-ink">{text}</p>
    </div>
  );
}
