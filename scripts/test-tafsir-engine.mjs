/* ====================================================================
 * Tafsir engine — integrity and honesty coverage
 * ====================================================================
 * The product brief is explicit: the Quran text is the database's job, the
 * reviewed sources are the scholar's job, and the model may only phrase.
 * These checks pin that separation:
 *
 *   C1  the fixed system prompt exists and still carries the integrity rules
 *   C2  the reviewed source pack is valid and never stores the verse text
 *   C3  the verse is resolved from the canonical dataset, not from data files
 *   C4  untrusted model output must pass validation or be rejected
 *   C5  curated wins; failed generation degrades honestly, never fabricates
 *   C6  wider reviewed coverage and a wired (optional) generator
 *   C7  the published offline edition is pinned, hashed, and never mislabelled
 * ==================================================================== */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "tafsir-engine-test");

const dataset = JSON.parse(readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8"));
const richFile = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "quran", "tafsir-rich.json"), "utf8")
);
const richEntries = richFile.entries;
const publishedPath = join(ROOT, "public", "quran", "tafsir-muyassar.json");
const publishedText = readFileSync(publishedPath, "utf8");
const publishedFile = JSON.parse(publishedText);

rmSync(OUT, { recursive: true, force: true });
const files = [
  join(ROOT, "src", "lib", "quran", "types.ts"),
  join(ROOT, "src", "lib", "quran", "validate.ts"),
  join(ROOT, "src", "lib", "quran", "tafsirSource.const.ts"),
  join(ROOT, "src", "lib", "quran", "tafsirSource.ts"),
  join(ROOT, "src", "lib", "tafsir", "types.ts"),
  join(ROOT, "src", "lib", "tafsir", "systemPrompt.ts"),
  join(ROOT, "src", "lib", "tafsir", "core.ts"),
];
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    ...files,
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "es2019",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types",
    "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

/* The promoted reviewed-summary module is compiled separately because it
   imports its dataset by relative path; keeping the original compile output
   flat avoids disturbing the C1-C5 checks above. */
const OUT_SUMMARY = join(ROOT, "node_modules", ".cache", "tafsir-summary-test");
rmSync(OUT_SUMMARY, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "lib", "tafsir", "summary.ts"),
    "--outDir", OUT_SUMMARY,
    "--rootDir", ROOT,
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--target", "es2019",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--skipLibCheck",
    "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const core = await import(pathToFileURL(join(OUT, "tafsir", "core.js")).href);
const prompt = await import(pathToFileURL(join(OUT, "tafsir", "systemPrompt.js")).href);
const source = await import(pathToFileURL(join(OUT, "quran", "tafsirSource.js")).href);
const summary = await import(
  pathToFileURL(join(OUT_SUMMARY, "src", "lib", "tafsir", "summary.js")).href
);

const {
  resolveTafsirContext,
  selectTafsir,
  generateTafsir,
  validateGeneratedTafsir,
  validateRichTafsirEntry,
} = core;
const { TAFSIR_SYSTEM_PROMPT, TAFSIR_SYSTEM_PROMPT_VERSION, buildTafsirUserPrompt } = prompt;

let passed = 0;
const total = [];
const check = (name, fn) => total.push({ name, fn });

function verseText(ref) {
  const [surah, ayah] = ref.split(":").map(Number);
  const chapter = dataset.chapters.find((c) => c.id === surah);
  const verse = chapter?.verses.find((v) => v.number === ayah);
  return verse?.text;
}

function entryFor(ref) {
  return richEntries.find((e) => e.ref === ref);
}

/* ---------------------------------------------------------------- */
/* C1 — the fixed prompt                                             */
/* ---------------------------------------------------------------- */

check("C1: the system prompt is versioned and substantial", () => {
  assert.match(TAFSIR_SYSTEM_PROMPT_VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(TAFSIR_SYSTEM_PROMPT.length > 800, "prompt looks truncated");
});

check("C1: the prompt still carries the integrity contract", () => {
  const required = [
    "أهل السنة والجماعة",
    "Ahl al-Sunnah wa al-Jama'ah",
    "Never fabricate",
    "verseText",
    "سبب النزول",
    "JSON",
    "الأقوى",
  ];
  for (const needle of required) {
    assert.ok(TAFSIR_SYSTEM_PROMPT.includes(needle), `prompt lost: ${needle}`);
  }
});

check("C1: the user turn is grounded on the verified verse", () => {
  const text = verseText("1:6");
  const user = buildTafsirUserPrompt({
    ref: "1:6",
    chapterName: "الفاتحة",
    ayahNumber: 6,
    verseText: text,
    locale: "ar",
    grounding: "ملخص مراجع",
  });
  assert.ok(user.includes(text), "the verse text must be supplied from the dataset");
  assert.ok(user.includes("1:6"), "the reference must be supplied");
  assert.ok(user.includes("ملخص مراجع"), "reviewed grounding must be supplied when present");
});

/* ---------------------------------------------------------------- */
/* C2 — the reviewed source pack                                     */
/* ---------------------------------------------------------------- */

check("C2: the source pack is non-empty and unique", () => {
  assert.ok(Array.isArray(richEntries) && richEntries.length > 0);
  assert.equal(new Set(richEntries.map((e) => e.ref)).size, richEntries.length);
});

check("C2: every entry passes structural validation", () => {
  for (const entry of richEntries) {
    assert.equal(validateRichTafsirEntry(entry), true, entry.ref);
  }
});

check("C2: every ref resolves in the canonical dataset", () => {
  for (const entry of richEntries) {
    assert.ok(verseText(entry.ref), `${entry.ref} is not a real ayah`);
  }
});

check("C2: no entry stores the exegeted verse text", () => {
  for (const entry of richEntries) {
    assert.ok(!("verseText" in entry), `${entry.ref}: verseText key must not exist`);
    const canonical = verseText(entry.ref);
    assert.ok(
      !JSON.stringify(entry).includes(canonical),
      `${entry.ref}: the canonical verse text must not be duplicated in the source file`
    );
  }
});

check("C2: reviewed entries carry source and review date", () => {
  for (const entry of richEntries) {
    assert.ok(entry.sourceEdition.trim().length > 0, entry.ref);
    assert.match(entry.reviewedDate, /^\d{4}-\d{2}-\d{2}$/, entry.ref);
  }
});

check("C2: the Al-Fatiha showcase is complete (1:1–1:7)", () => {
  for (let a = 1; a <= 7; a += 1) {
    assert.ok(entryFor(`1:${a}`), `1:${a} missing from the reviewed pack`);
  }
});

check("C2: the famous ayahs beyond Al-Fatiha are present", () => {
  for (const ref of ["2:255", "2:285", "2:286"]) {
    assert.ok(entryFor(ref), `${ref} missing from the reviewed pack`);
  }
});

check("C2: every entry offers all four application levels", () => {
  for (const entry of richEntries) {
    assert.ok(entry.application, `${entry.ref}: application missing`);
    for (const level of ["personal", "family", "work", "social"]) {
      assert.ok(entry.application[level], `${entry.ref}: ${level} missing`);
    }
  }
});

check("C2: every entry is a complete article, not a stub", () => {
  for (const entry of richEntries) {
    assert.ok(entry.overview && entry.overview.length > 30, `${entry.ref}: overview too short`);
    assert.ok(entry.detailed && entry.detailed.length >= 2, `${entry.ref}: detailed too short`);
    assert.ok(entry.reflection && entry.reflection.length >= 3, `${entry.ref}: needs 3 reflections`);
    assert.ok(entry.summary, `${entry.ref}: summary missing`);
  }
});

check("C2: an unestablished revelation is stated explicitly", () => {
  for (const entry of richEntries) {
    if (entry.revelation?.status === "none") {
      assert.ok(
        entry.revelation.text && entry.revelation.text.trim().length > 0,
        `${entry.ref}: a "none" status must still say so in words`
      );
    }
  }
});

check("C2: quoted hadith always carries a source marker", () => {
  // The brief forbids a hadith without its source/grading. A quote mark next to
  // the Prophet's name is the cheapest reliable signal that a hadith is present.
  const markers = ["رواه", "متفق عليه", "البخاري", "مسلم", "أبو داود", "الترمذي", "النسائي", "ابن ماجه", "أحمد", "صححه", "حسّنه"];
  const strings = (entry) => {
    const out = [];
    const push = (v) => typeof v === "string" && out.push(v);
    push(entry.overview); push(entry.context); push(entry.dua); push(entry.summary);
    (entry.detailed ?? []).forEach(push);
    (entry.benefits ?? []).forEach((b) => push(b.text));
    if (entry.scholars) { push(entry.scholars.summary); (entry.scholars.views ?? []).forEach((v) => { push(v.view); push(v.evidence); }); }
    if (entry.revelation) push(entry.revelation.text);
    (entry.reflection ?? []).forEach(push);
    return out;
  };
  for (const entry of richEntries) {
    for (const text of strings(entry)) {
      if (!text.includes("ﷺ") || !text.includes("«")) continue;
      assert.ok(
        markers.some((m) => text.includes(m)),
        `${entry.ref}: a hadith quote has no source marker -> ${text.slice(0, 80)}`
      );
    }
  }
});

check("C2: 1:6 is present with the requested sections", () => {
  const entry = entryFor("1:6");
  assert.ok(entry, "the flagship example must exist");
  assert.equal(entry.reviewStatus, "reviewed");
  assert.ok(entry.overview && entry.overview.length > 30);
  assert.ok(entry.vocabulary.length >= 2);
  assert.ok(entry.context);
  assert.ok(entry.revelation);
  assert.ok(entry.detailed.length >= 2);
  assert.ok(entry.benefits.length >= 2);
  assert.ok(entry.scholars && entry.scholars.views.length >= 2);
  assert.ok(entry.application && entry.application.personal && entry.application.family);
  assert.ok(entry.application.work && entry.application.social);
  assert.ok(entry.reflection.length >= 3);
  assert.ok(entry.dua);
  assert.ok(entry.summary);
});

/* ---------------------------------------------------------------- */
/* C3 — canonical resolution and honest selection                    */
/* ---------------------------------------------------------------- */

check("C3: the verse resolves from the dataset, not from the source file", () => {
  const ctx = resolveTafsirContext("1:6", dataset);
  assert.ok(ctx);
  assert.equal(ctx.ref, "1:6");
  assert.equal(ctx.chapterId, 1);
  assert.equal(ctx.ayahNumber, 6);
  assert.equal(ctx.verseText, verseText("1:6"));
});

check("C3: a reviewed entry is selected for 1:6", () => {
  const result = selectTafsir({ ref: "1:6", dataset, curated: richEntries });
  assert.equal(result.status, "curated");
  assert.equal(result.entry.reviewStatus, "reviewed");
  assert.equal(result.provider, "curated");
});

check("C3: no source means an honest unavailable state", () => {
  const result = selectTafsir({ ref: "112:1", dataset, curated: richEntries });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "no-source");
  assert.equal(result.aiEnabled, false);
});

check("C3: a missing dataset is reported, never guessed", () => {
  const result = selectTafsir({ ref: "1:6", dataset: null, curated: richEntries });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "no-dataset");
});

check("C3: an unknown reference is rejected", () => {
  const result = selectTafsir({ ref: "999:999", dataset, curated: richEntries });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "invalid-ref");
});

/* ---------------------------------------------------------------- */
/* C4 — untrusted model output                                       */
/* ---------------------------------------------------------------- */

function ctx(ref) {
  return resolveTafsirContext(ref, dataset);
}

check("C4: non-JSON output is rejected", () => {
  const v = validateGeneratedTafsir("this is not json", ctx("1:7"));
  assert.equal(v.ok, false);
  assert.ok(v.problems.length > 0);
});

check("C4: output may not supply the verse text", () => {
  const raw = JSON.stringify({ overview: "معنى", verseText: verseText("1:7") });
  const v = validateGeneratedTafsir(raw, ctx("1:7"));
  assert.equal(v.ok, false);
});

check("C4: output may not answer a different verse", () => {
  const raw = JSON.stringify({ overview: "معنى", ref: "2:255" });
  const v = validateGeneratedTafsir(raw, ctx("1:7"));
  assert.equal(v.ok, false);
});

check("C4: unfilled placeholder tokens are rejected", () => {
  const raw = JSON.stringify({ overview: "معنى {{n}}" });
  const v = validateGeneratedTafsir(raw, ctx("1:7"));
  assert.equal(v.ok, false);
});

check("C4: output with no substantive section is rejected", () => {
  const raw = JSON.stringify({ vocabulary: [{ term: "x", meaning: "y" }] });
  const v = validateGeneratedTafsir(raw, ctx("1:7"));
  assert.equal(v.ok, false);
});

check("C4: a valid object is accepted and marked draft", () => {
  const raw = JSON.stringify({
    overview: "معنى إجمالي واضح للآية.",
    detailed: ["شرح أول", "شرح ثانٍ"],
    reflection: ["سؤال أول", "سؤال ثانٍ", "سؤال ثالث"],
  });
  const v = validateGeneratedTafsir(raw, ctx("1:7"));
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.equal(v.entry.reviewStatus, "draft");
  assert.equal(v.entry.ref, "1:7");
});

/* ---------------------------------------------------------------- */
/* C5 — generation precedence and fallback                           */
/* ---------------------------------------------------------------- */

const provider = (complete, id = "fake") => ({ id, enabled: true, complete });

check("C5: a reviewed entry never calls the model", async () => {
  let calls = 0;
  const result = await generateTafsir({
    ref: "1:6",
    dataset,
    curated: richEntries,
    provider: provider(async () => {
      calls += 1;
      return JSON.stringify({ overview: "لا ينبغي أن يصل" });
    }),
  });
  assert.equal(result.status, "curated");
  assert.equal(calls, 0, "curated must win without spending a model call");
});

check("C5: validated generation ships when no review exists", async () => {
  const output = JSON.stringify({
    overview: "معنى إجمالي.",
    detailed: ["شرح."],
  });
  const result = await generateTafsir({
    ref: "112:1",
    dataset,
    curated: richEntries,
    provider: provider(async () => output),
  });
  assert.equal(result.status, "generated");
  assert.equal(result.entry.reviewStatus, "draft");
  assert.equal(result.provider, "fake");
});

check("C5: a throwing provider degrades honestly", async () => {
  const result = await generateTafsir({
    ref: "112:1",
    dataset,
    curated: richEntries,
    provider: provider(async () => {
      throw new Error("network down");
    }),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "no-source");
});

check("C5: invalid model output is never shown as tafsir", async () => {
  const result = await generateTafsir({
    ref: "112:1",
    dataset,
    curated: richEntries,
    provider: provider(async () => "```json\n{\"overview\":\"x\",\"verseText\":\"مُحرَّف\"}\n```"),
  });
  assert.equal(result.status, "unavailable");
});

/* ---------------------------------------------------------------- */
/* C6 — wider reviewed coverage and a wired (optional) generator      */
/* ---------------------------------------------------------------- */

const legacy = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "quran", "tafsir.json"), "utf8")
);
const readSrc = (rel) => readFileSync(join(ROOT, rel), "utf8");

check("C6: promoted summaries are a faithful mapping, not new scholarship", () => {
  const reviewed = legacy.entries.filter((e) => e.reviewStatus === "reviewed");
  const promoted = summary.SUMMARY_TAFSIR;
  assert.equal(promoted.length, reviewed.length);
  promoted.forEach((entry, i) => {
    const source = reviewed[i];
    assert.equal(entry.ref, source.ref);
    assert.equal(entry.overview, source.simplifiedMeaning);
    assert.equal(entry.summary, source.simplerMeaning);
    assert.deepEqual(entry.practice, source.howToLive);
    assert.deepEqual(entry.reflection, [source.reflection]);
    assert.equal(entry.reviewStatus, "reviewed");
    assert.ok(entry.sourceEdition.includes(source.tafsirSource));
  });
});

check("C6: promoted summaries validate and resolve in the dataset", () => {
  for (const entry of summary.SUMMARY_TAFSIR) {
    assert.equal(validateRichTafsirEntry(entry), true, entry.ref);
    assert.ok(verseText(entry.ref), `${entry.ref} is not a real ayah`);
    assert.ok(!("verseText" in entry), `${entry.ref}: verse text must not be stored`);
  }
});

check("C6: reviewed coverage is deduplicated and full articles win", () => {
  const richRefs = new Set(richEntries.map((e) => e.ref));
  const overlap = summary.SUMMARY_TAFSIR.filter((e) => richRefs.has(e.ref));
  assert.ok(overlap.length > 0, "expected shared flagship ayahs");
  const sources = readSrc("src/lib/tafsir/sources.ts");
  assert.match(sources, /RICH_TAFSIR/);
  assert.match(sources, /SUMMARY_TAFSIR\.filter/);
  assert.match(sources, /!RICH_REFS\.has\(entry\.ref\)/);
  assert.match(sources, /validateRichTafsirEntry\(entry\)/);
  const unique = new Set([...richRefs, ...summary.SUMMARY_TAFSIR.map((e) => e.ref)]);
  assert.equal(unique.size, richEntries.length + summary.SUMMARY_TAFSIR.length - overlap.length);
});

check("C6: the optional generator is reachable from both ayah screens", () => {
  const index = readSrc("src/lib/tafsir/index.ts");
  assert.match(index, /export function isTafsirAIEnabled/);
  assert.match(index, /provider: createRemoteProvider\(\)/);
  assert.match(index, /curated: REVIEWED_TAFSIR/);
  const hook = readSrc("src/hooks/useTafsirGeneration.ts");
  assert.match(hook, /generateTafsirLive\(ref, dataset, published\)/);
  assert.match(hook, /if \(!ref\) return/);
  for (const file of [
    "src/components/views/Ayah.tsx",
    "src/components/views/AyahActionsSheet.tsx",
  ]) {
    const src = readSrc(file);
    assert.match(src, /useTafsirGeneration\(/, file);
    assert.match(src, /isTafsirAIEnabled\(\)/, file);
    assert.match(src, /generation\.generate/, file);
    assert.match(src, /generation\.state === "loading"/, file);
  }
  assert.match(readSrc("src/components/TafsirPanel.tsx"), /entry\.practice/);
});

check("C6: generation strings exist in both locales", () => {
  const locale = readSrc("src/lib/locale.ts");
  for (const key of ["tafsir.action.generate", "tafsir.generating", "tafsir.generatedError"]) {
    assert.equal(locale.split(`"${key}"`).length - 1, 2, `${key} must be in AR and EN`);
  }
});

/* ---------------------------------------------------------------- */
/* C7 — published offline source: provenance, hash, and labelling     */
/* ---------------------------------------------------------------- */

check("C7: the pinned asset matches the generated SHA-256 constants", () => {
  assert.equal(source.TAFSIR_SOURCE_META.sha256.length, 64);
  assert.match(source.TAFSIR_SOURCE_META.sha256, /^[0-9a-f]{64}$/);
  assert.equal(publishedFile.version, source.TAFSIR_SOURCE_META.version);
  assert.equal(publishedFile.edition, source.TAFSIR_SOURCE_META.edition);
  assert.equal(publishedFile.upstreamVersion, source.TAFSIR_SOURCE_META.release);
  assert.equal(publishedFile.entries.length, source.TAFSIR_SOURCE_META.ayahs);
  assert.equal(publishedFile.entries.length, 6236);
});

check("C7: hash verification rejects even a one-character edit", async () => {
  assert.equal(await source.verifyPublishedTafsirText(publishedText), true);
  const first = publishedFile.entries[0];
  const tampered = {
    ...publishedFile,
    entries: [{ ...first, text: first.text + " " }, ...publishedFile.entries.slice(1)],
  };
  assert.equal(await source.verifyPublishedTafsirText(JSON.stringify(tampered)), false);
});

check("C7: the complete published pack maps without invented sections", () => {
  const mapped = source.mapPublishedTafsir(publishedFile);
  assert.ok(Array.isArray(mapped));
  assert.equal(mapped.length, 6236);
  assert.equal(new Set(mapped.map((e) => e.ref)).size, mapped.length);
  for (const entry of mapped) {
    assert.equal(entry.reviewStatus, "published", entry.ref);
    assert.equal(entry.sourceDate, publishedFile.retrievedAt, entry.ref);
    assert.match(entry.sourceDate, /^\d{4}-\d{2}-\d{2}$/, entry.ref);
    assert.match(entry.sourceEdition, /ar-tafsir-muyassar v1\.2\.3/, entry.ref);
    assert.ok(Array.isArray(entry.detailed) && entry.detailed.length > 0, entry.ref);
    assert.ok(!("reviewedDate" in entry), `${entry.ref}: not an in-house review`);
    assert.ok(!("verseText" in entry), `${entry.ref}: no verse text may be stored`);
    assert.ok(verseText(entry.ref), `${entry.ref} is not a real ayah`);
    assert.equal(validateRichTafsirEntry(entry), true, entry.ref);
  }
});

check("C7: malformed or partial published files are rejected outright", () => {
  assert.equal(source.mapPublishedTafsir(null), null);
  assert.equal(source.mapPublishedTafsir({ ...publishedFile, edition: "other" }), null);
  assert.equal(
    source.mapPublishedTafsir({ ...publishedFile, entries: publishedFile.entries.slice(1) }),
    null
  );
  assert.equal(
    source.mapPublishedTafsir({
      ...publishedFile,
      entries: [{ ref: publishedFile.entries[0].ref }],
    }),
    null
  );
  /* A file that loses its attribution must not be accepted even if someone
     later re-pins its hash: provenance is part of the source contract. */
  for (const field of ["editionName", "upstream", "upstreamSource", "sourceUrl", "license"]) {
    const stripped = { ...publishedFile };
    delete stripped[field];
    assert.equal(source.mapPublishedTafsir(stripped), null, `missing ${field}`);
  }
  assert.equal(source.mapPublishedTafsir({ ...publishedFile, retrievedAt: "23-11-2026" }), null);
});

check("C7: failures and tampered payloads stay retryable; success is cached", async () => {
  const realFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: false, status: 503 };
    };
    assert.equal(await source.loadPublishedTafsir(), null);
    assert.equal(await source.loadPublishedTafsir(), null);
    assert.equal(calls, 2, "a transient failure must not be cached forever");

    /* A payload that fails the hash pin must be rejected AND must not poison
       the cache: the next honest fetch can still succeed. */
    const firstEntry = publishedFile.entries[0];
    const tamperedText = JSON.stringify({
      ...publishedFile,
      entries: [{ ...firstEntry, text: firstEntry.text + " " }, ...publishedFile.entries.slice(1)],
    });
    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: true, text: async () => tamperedText };
    };
    assert.equal(await source.loadPublishedTafsir(), null, "tampered payload rejected");
    assert.equal(await source.loadPublishedTafsir(), null, "tampered payload not cached");
    assert.equal(calls, 2, "a tampered payload must remain retryable");

    /* One verified load is shared by concurrent callers AND cached for later
       mounts, so the 2.9 MB asset is fetched and hashed only once. */
    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return { ok: true, text: async () => publishedText };
    };
    const [first, second] = await Promise.all([
      source.loadPublishedTafsir(),
      source.loadPublishedTafsir(),
    ]);
    assert.ok(Array.isArray(first) && first.length === 6236);
    assert.equal(second, first, "concurrent callers must share the same verified pack");
    assert.equal(calls, 1, "concurrent callers must share one fetch");
    const third = await source.loadPublishedTafsir();
    assert.equal(third, first, "a verified pack must be reused on later mounts");
    assert.equal(calls, 1, "a cached pack must not refetch");
  } finally {
    globalThis.fetch = realFetch;
  }
});

check("C7: reviewed text wins; published text wins over generation", async () => {
  const mapped = source.mapPublishedTafsir(publishedFile);
  const publishedForReviewedRef = mapped.find((e) => e.ref === "1:6");
  const publishedOnlyRef = mapped.find((e) => e.ref === "112:1");
  assert.ok(publishedForReviewedRef && publishedOnlyRef);

  const reviewedWins = selectTafsir({
    ref: "1:6",
    dataset,
    curated: richEntries,
    published: [publishedForReviewedRef],
  });
  assert.equal(reviewedWins.status, "curated");
  assert.equal(reviewedWins.entry.reviewStatus, "reviewed");

  const publishedFallback = selectTafsir({
    ref: "112:1",
    dataset,
    curated: richEntries,
    published: [publishedOnlyRef],
  });
  assert.equal(publishedFallback.status, "curated");
  assert.equal(publishedFallback.entry.reviewStatus, "published");

  let calls = 0;
  const noGeneration = await generateTafsir({
    ref: "112:1",
    dataset,
    curated: richEntries,
    published: [publishedOnlyRef],
    provider: provider(async () => {
      calls += 1;
      return JSON.stringify({ overview: "لا ينبغي أن يصل" });
    }),
  });
  assert.equal(noGeneration.status, "curated");
  assert.equal(calls, 0, "a verified published source must not be regenerated");
});

check("C7: both ayah screens load the source and prefer it over stale drafts", () => {
  const hook = readSrc("src/hooks/useTafsirGeneration.ts");
  assert.match(hook, /generateTafsirLive\(ref, dataset, published\)/);
  assert.match(hook, /record\.published === published/);
  assert.match(hook, /prev\.id === id/, "an older request must not overwrite a newer result");
  const sourceHook = readSrc("src/hooks/usePublishedTafsirSource.ts");
  assert.match(sourceHook, /useEffect\(/);
  assert.match(sourceHook, /enabled = true/, "the load must be gated before an ayah tap");
  const loader = readSrc("src/lib/quran/tafsirSource.ts");
  assert.match(loader, /verifyPublishedTafsirText\(text\)/);
  assert.match(loader, /cached/, "a verified pack must be cached for the session");

  const ayah = readSrc("src/components/views/Ayah.tsx");
  assert.match(ayah, /usePublishedTafsirSource\(true, ayahId\)/, "Ayah.tsx");
  assert.match(ayah, /publishedSource\.entries/, "Ayah.tsx");
  assert.match(ayah, /publishedSource\.state === "loading"/, "Ayah.tsx");
  assert.match(
    ayah,
    /tafsirModel\.status === "unavailable" \? \(generation\.model \?\? tafsirModel\)/,
    "Ayah.tsx"
  );

  const sheet = readSrc("src/components/views/AyahActionsSheet.tsx");
  assert.match(
    sheet,
    /usePublishedTafsirSource\(Boolean\(ayahRef\), ayahRef\)/,
    "the reader must not fetch 2.9 MB before an ayah tap"
  );
  assert.match(sheet, /publishedSource\.entries/, "AyahActionsSheet.tsx");
  assert.match(sheet, /publishedSource\.state === "loading"/, "AyahActionsSheet.tsx");
  assert.match(
    sheet,
    /tafsirModel\.status === "unavailable" \? \(generation\.model \?\? tafsirModel\)/,
    "AyahActionsSheet.tsx"
  );

  const panel = readSrc("src/components/TafsirPanel.tsx");
  assert.match(panel, /entry\.reviewStatus === "published"/);
  assert.match(panel, /tafsir\.badge\.published/);
  assert.match(panel, /tafsir\.publishedDisclaimer/);
  assert.match(panel, /tafsir\.generatedDisclaimer/);
  /* Copy and share leave the screen, so the honesty label must travel with
     the text instead of being dropped. */
  assert.match(panel, /if \(published\) \{[\s\S]{0,200}tafsir\.publishedDisclaimer/);
  assert.match(panel, /if \(generated\) lines\.push\(t\("tafsir\.generatedDisclaimer"\)\)/);
  assert.ok(
    panel.includes("published ? p : `${i + 1}. ${p}`"),
    "published paragraphs must be copied verbatim without invented numbering"
  );
});

check("C7: the mushaf tafsir button surface uses the same lazy source", () => {
  const sheet = readSrc("src/components/TadabburSheet.tsx");
  assert.match(
    sheet,
    /usePublishedTafsirSource\(\s*open && Boolean\(ayahId\),\s*open \? ayahId : null\s*\)/,
    "the 2.9 MB pack must load only while the mushaf tafsir sheet is open"
  );
  assert.match(
    sheet,
    /buildTafsirModel\(ayahId, quran\.dataset, publishedSource\.entries\)/,
    "the sheet must use reviewed-then-published selection"
  );
  assert.match(sheet, /<TafsirPanel\b/, "non-curated ayahs must get a real tafsir panel");
  assert.match(sheet, /useAudioPlayer\(\)/, "the sheet must reuse the recitation engine");
  assert.match(
    sheet,
    /loadSurah\(chapter\.id, verse\.number\)/,
    "recitation must start at the sheet's ayah"
  );
  assert.doesNotMatch(
    sheet,
    /audio\.player\.isLoading/,
    "idle is not a loading state: the picker must stay reachable"
  );
  assert.match(sheet, /audio\.player\.state === "loading"/);
});

check("C7: published status strings exist in both locales", () => {
  const locale = readSrc("src/lib/locale.ts");
  for (const key of [
    "tafsir.badge.published",
    "tafsir.badge.publishedHint",
    "tafsir.publishedDisclaimer",
    "tafsir.generatedDisclaimer",
    "tafsir.sourceLoading",
    "tafsir.sourceUnavailable",
  ]) {
    assert.equal(locale.split(`"${key}"`).length - 1, 2, `${key} must be in AR and EN`);
  }
  /* With full published coverage, "no source" no longer means "no reviewed
     tafsir" — that would misrepresent a packaging failure as a content gap. */
  assert.ok(
    locale.includes('"tafsir.unavailable.noSource": "No tafsir source is currently available'),
    "EN no-source copy must not claim a reviewed-only state"
  );
  assert.ok(
    locale.includes('"tafsir.unavailable.noSource": "لا يتوفّر مصدر تفسير'),
    "AR no-source copy must not claim a reviewed-only state"
  );
});

check("C7: the built asset (when present) matches the pinned SHA-256", async () => {
  const builtPath = join(ROOT, "out", "quran", "tafsir-muyassar.json");
  if (!existsSync(builtPath)) return; // static export not built in this run
  assert.equal(
    await source.verifyPublishedTafsirText(readFileSync(builtPath, "utf8")),
    true,
    "the built asset must be byte-identical to the pinned source"
  );
});

/* ---------------------------------------------------------------- */
/* Run                                                               */
/* ---------------------------------------------------------------- */

for (const { name, fn } of total) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}
console.log();
console.log(`Tafsir engine: ${passed}/${total.length} passed`);
if (passed !== total.length) process.exit(1);
