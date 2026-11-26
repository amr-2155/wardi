import type { QuranDataset } from "../quran/types";
import { resolveAyah } from "../quran/validate";
import {
  buildTafsirUserPrompt,
  TAFSIR_SYSTEM_PROMPT,
} from "./systemPrompt";
import type {
  RichTafsirEntry,
  TafsirBenefit,
  TafsirContext,
  TafsirProvider,
  TafsirResult,
  TafsirScholarView,
  TafsirVocabularyItem,
} from "./types";

/* ------------------------------------------------------------------ */
/* Small runtime guards. Everything from JSON or a model is untrusted. */
/* ------------------------------------------------------------------ */

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);

const isBenefitCategory = (v: unknown): v is TafsirBenefit["category"] =>
  v === "creed" || v === "educational" || v === "legal";

const isStrength = (v: unknown): v is NonNullable<TafsirScholarView["strength"]> =>
  v === "stronger" || v === "mentioned";

function isVocabulary(v: unknown): v is TafsirVocabularyItem[] {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        isNonEmptyString((item as Record<string, unknown>).term) &&
        isNonEmptyString((item as Record<string, unknown>).meaning)
    )
  );
}

function isBenefits(v: unknown): v is TafsirBenefit[] {
  return (
    Array.isArray(v) &&
    v.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        isBenefitCategory((item as Record<string, unknown>).category) &&
        isNonEmptyString((item as Record<string, unknown>).text)
    )
  );
}

function isScholarViews(v: unknown): v is TafsirScholarView[] {
  return (
    Array.isArray(v) &&
    v.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const o = item as Record<string, unknown>;
      if (!isNonEmptyString(o.view)) return false;
      if (o.evidence !== undefined && !isNonEmptyString(o.evidence)) return false;
      if (o.strength !== undefined && !isStrength(o.strength)) return false;
      return true;
    })
  );
}

function isRevelation(v: unknown): v is RichTafsirEntry["revelation"] {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.status !== "established" && o.status !== "none") return false;
  if (o.text !== undefined && !isNonEmptyString(o.text)) return false;
  return true;
}

function isApplication(v: unknown): v is RichTafsirEntry["application"] {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  for (const key of ["personal", "family", "work", "social"] as const) {
    if (o[key] !== undefined && !isNonEmptyString(o[key])) return false;
  }
  return true;
}

/**
 * Validates a curated entry read from `tafsir-rich.json`.
 *
 * It intentionally does NOT require every section: the brief allows a section
 * to be absent when no evidence supports it, and forcing one would invite
 * invented filler. It does require the identity and review metadata, and it
 * requires at least one substantive section so an empty shell is rejected.
 */
export function validateRichTafsirEntry(value: unknown): value is RichTafsirEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.ref !== "string" || !/^\d{1,3}:\d{1,3}$/.test(v.ref)) return false;
  if (
    v.reviewStatus !== "reviewed" &&
    v.reviewStatus !== "published" &&
    v.reviewStatus !== "draft"
  ) {
    return false;
  }
  if (v.reviewStatus === "published") {
    if (!isNonEmptyString(v.sourceDate)) return false;
  } else if (!isNonEmptyString(v.reviewedDate)) {
    return false;
  }
  if (!isNonEmptyString(v.sourceEdition)) return false;

  const hasSubstance =
    isNonEmptyString(v.overview) ||
    isNonEmptyString(v.context) ||
    isNonEmptyString(v.dua) ||
    isNonEmptyString(v.summary) ||
    isStringArray(v.detailed) ||
     isStringArray(v.practice) ||
    isStringArray(v.reflection);
  if (!hasSubstance) return false;

  if (v.overview !== undefined && !isNonEmptyString(v.overview)) return false;
  if (v.context !== undefined && !isNonEmptyString(v.context)) return false;
  if (v.dua !== undefined && !isNonEmptyString(v.dua)) return false;
  if (v.summary !== undefined && !isNonEmptyString(v.summary)) return false;
  if (v.vocabulary !== undefined && !isVocabulary(v.vocabulary)) return false;
  if (v.detailed !== undefined && !isStringArray(v.detailed)) return false;
  if (v.practice !== undefined && !isStringArray(v.practice)) return false;
  if (v.benefits !== undefined && !isBenefits(v.benefits)) return false;
  if (v.reflection !== undefined && !isStringArray(v.reflection)) return false;
  if (v.revelation !== undefined && !isRevelation(v.revelation)) return false;
  if (v.application !== undefined && !isApplication(v.application)) return false;
  if (v.scholars !== undefined) {
    if (typeof v.scholars !== "object" || v.scholars === null) return false;
    const s = v.scholars as Record<string, unknown>;
    if (s.summary !== undefined && !isNonEmptyString(s.summary)) return false;
    if (s.views !== undefined && !isScholarViews(s.views)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Grounding                                                           */
/* ------------------------------------------------------------------ */

/** Resolves the verse from the canonical dataset; null when it cannot. */
export function resolveTafsirContext(
  ref: string,
  dataset: QuranDataset | null,
  locale: "ar" | "en" = "ar"
): TafsirContext | null {
  if (!dataset) return null;
  const resolved = resolveAyah(ref, dataset);
  if (!resolved) return null;
  return {
    ref: resolved.chapter.id + ":" + resolved.verse.number,
    chapterId: resolved.chapter.id,
    chapterName: resolved.chapter.name,
    ayahNumber: resolved.verse.number,
    verseText: resolved.verse.text,
    locale,
  };
}

export function getCuratedEntry(
  ref: string,
  curated: RichTafsirEntry[],
  published: RichTafsirEntry[] = []
): RichTafsirEntry | null {
  /* The in-house reviewed pack always wins. Published text is a fallback, and
     is revalidated here so a corrupted async payload can never be rendered. */
  return (
    curated.find((entry) => entry.ref === ref) ??
    published.find(
      (entry) => entry.ref === ref && validateRichTafsirEntry(entry)
    ) ??
    null
  );
}

/**
 * Synchronous, safe selection used by the UI: reviewed entry first, then a
 * hash-verified published edition, otherwise an honest "unavailable".
 * It never calls a model.
 */
export function selectTafsir(args: {
  ref: string;
  dataset: QuranDataset | null;
  curated: RichTafsirEntry[];
  published?: RichTafsirEntry[];
  aiEnabled?: boolean;
  locale?: "ar" | "en";
}): TafsirResult {
  if (!args.dataset) {
    return {
      status: "unavailable",
      context: null,
      reason: "no-dataset",
      aiEnabled: Boolean(args.aiEnabled),
    };
  }
  const context = resolveTafsirContext(args.ref, args.dataset, args.locale ?? "ar");
  if (!context) {
    return {
      status: "unavailable",
      context: null,
      reason: "invalid-ref",
      aiEnabled: Boolean(args.aiEnabled),
    };
  }
  const entry = getCuratedEntry(context.ref, args.curated, args.published);
  if (entry) {
    return { status: "curated", context, entry, provider: "curated" };
  }
  return {
    status: "unavailable",
    context,
    reason: "no-source",
    aiEnabled: Boolean(args.aiEnabled),
  };
}

/* ------------------------------------------------------------------ */
/* Model output validation                                             */
/* ------------------------------------------------------------------ */

const stripFences = (raw: string): string =>
  raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/```\s*$/, "")
    .trim();

export type GeneratedValidation = {
  ok: boolean;
  problems: string[];
  entry: RichTafsirEntry | null;
};

/**
 * Validates a raw model response before it may be shown.
 *
 * The model is untrusted. It must return the agreed JSON shape, must not claim
 * a different verse, and — critically — must not supply the verse text itself.
 * A failed validation means the caller keeps the reviewed entry or reports the
 * feature unavailable; it never renders unverified output as trusted tafsir.
 */
export function validateGeneratedTafsir(
  raw: string,
  context: TafsirContext
): GeneratedValidation {
  const problems: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, problems: ["response is not valid JSON"], entry: null };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, problems: ["response is not a JSON object"], entry: null };
  }

  const o = parsed as Record<string, unknown>;

  if ("verseText" in o) {
    problems.push("model tried to supply verse text; only the dataset may");
  }
  if (o.ref !== undefined && o.ref !== context.ref) {
    problems.push("model answered for a different verse");
  }

  const hasSubstance =
    isNonEmptyString(o.overview) ||
    isNonEmptyString(o.summary) ||
    isStringArray(o.detailed);
  if (!hasSubstance) problems.push("no substantive interpretation section");

  if (o.overview !== undefined && !isNonEmptyString(o.overview)) problems.push("overview invalid");
  if (o.context !== undefined && !isNonEmptyString(o.context)) problems.push("context invalid");
  if (o.dua !== undefined && !isNonEmptyString(o.dua)) problems.push("dua invalid");
  if (o.summary !== undefined && !isNonEmptyString(o.summary)) problems.push("summary invalid");
  if (o.vocabulary !== undefined && !isVocabulary(o.vocabulary)) problems.push("vocabulary invalid");
  if (o.detailed !== undefined && !isStringArray(o.detailed)) problems.push("detailed invalid");
  if (o.benefits !== undefined && !isBenefits(o.benefits)) problems.push("benefits invalid");
  if (o.reflection !== undefined && !isStringArray(o.reflection)) problems.push("reflection invalid");
  if (o.revelation !== undefined && !isRevelation(o.revelation)) problems.push("revelation invalid");
  if (o.application !== undefined && !isApplication(o.application)) problems.push("application invalid");
  if (o.scholars !== undefined) {
    if (typeof o.scholars !== "object" || o.scholars === null) {
      problems.push("scholars invalid");
    } else {
      const s = o.scholars as Record<string, unknown>;
      if (s.summary !== undefined && !isNonEmptyString(s.summary)) problems.push("scholars.summary invalid");
      if (s.views !== undefined && !isScholarViews(s.views)) problems.push("scholars.views invalid");
    }
  }

  if (JSON.stringify(parsed).includes("{{")) {
    problems.push("unfilled placeholder token leaked from the prompt");
  }

  if (problems.length > 0) {
    return { ok: false, problems, entry: null };
  }

  const entry: RichTafsirEntry = {
    ref: context.ref as RichTafsirEntry["ref"],
    reviewStatus: "draft",
    reviewedDate: new Date().toISOString().slice(0, 10),
    sourceEdition: "مُولَّد بالذكاء الاصطناعي — لم يُراجَع بشريًا بعد",
    overview: o.overview as string | undefined,
    vocabulary: o.vocabulary as TafsirVocabularyItem[] | undefined,
    context: o.context as string | undefined,
    revelation: o.revelation as RichTafsirEntry["revelation"],
    detailed: o.detailed as string[] | undefined,
    benefits: o.benefits as TafsirBenefit[] | undefined,
    scholars: o.scholars as RichTafsirEntry["scholars"],
    application: o.application as RichTafsirEntry["application"],
    reflection: o.reflection as string[] | undefined,
    dua: o.dua as string | undefined,
    summary: o.summary as string | undefined,
  };
  return { ok: true, problems: [], entry };
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

/** Flattens a reviewed entry into grounding text for the model. */
export function groundEntry(entry: RichTafsirEntry | null): string | undefined {
  if (!entry) return undefined;
  const parts = [
    entry.overview,
    entry.summary,
    entry.context,
    entry.detailed?.join(" "),
  ].filter((p): p is string => isNonEmptyString(p));
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Async path: prefer a reviewed entry, then a published one; only when neither
 * exists AND a trusted provider is enabled does it ask the model, and only
 * validated output ships.
 */
export async function generateTafsir(args: {
  ref: string;
  dataset: QuranDataset | null;
  curated: RichTafsirEntry[];
  published?: RichTafsirEntry[];
  provider: TafsirProvider | null;
  locale?: "ar" | "en";
}): Promise<TafsirResult> {
  const base = selectTafsir({
    ref: args.ref,
    dataset: args.dataset,
    curated: args.curated,
    published: args.published,
    aiEnabled: Boolean(args.provider?.enabled),
    locale: args.locale,
  });
  /* A reviewed entry always wins: accuracy over novelty. */
  if (base.status !== "unavailable") return base;
  if (!base.context || !args.provider?.enabled) return base;

  const grounding = groundEntry(
    getCuratedEntry(base.context.ref, args.curated, args.published)
  );
  try {
    const raw = await args.provider.complete({
      system: TAFSIR_SYSTEM_PROMPT,
      user: buildTafsirUserPrompt({ ...base.context, grounding }),
    });
    const checked = validateGeneratedTafsir(raw, base.context);
    if (checked.ok && checked.entry) {
      return {
        status: "generated",
        context: base.context,
        entry: checked.entry,
        provider: args.provider.id,
      };
    }
  } catch {
    /* fall through to the honest unavailable result */
  }
  return base;
}
