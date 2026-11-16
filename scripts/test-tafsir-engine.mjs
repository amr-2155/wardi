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
 * ==================================================================== */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "tafsir-engine-test");

const dataset = JSON.parse(readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8"));
const richFile = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "quran", "tafsir-rich.json"), "utf8")
);
const richEntries = richFile.entries;

rmSync(OUT, { recursive: true, force: true });
const files = [
  join(ROOT, "src", "lib", "quran", "types.ts"),
  join(ROOT, "src", "lib", "quran", "validate.ts"),
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

const core = await import(pathToFileURL(join(OUT, "tafsir", "core.js")).href);
const prompt = await import(pathToFileURL(join(OUT, "tafsir", "systemPrompt.js")).href);

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
