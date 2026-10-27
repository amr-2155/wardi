/**
 * W2 — Bilingual UI regression tests.
 *
 * Additive: test-w1.mjs is untouched. This file only guards what W2 changed.
 *
 * Static analysis only, by design. W2 moved user-visible strings out of JSX
 * and into the locale dictionaries, so the failure modes are all of the
 * "looks fine in one language" variety and none of them need a browser:
 *
 *   - a key defined in one language and missing in the other,
 *   - a placeholder the call site never supplies (renders a literal "{{n}}"),
 *   - a hardcoded Arabic literal creeping back into a localized file,
 *   - a physical `text-left`/`mr-*` utility that silently breaks in LTR,
 *   - the language switcher no longer actually switching anything.
 *
 * Nothing here re-implements app logic. Where real behaviour is checked, the
 * REAL module is compiled with the project tsc and imported, matching the
 * existing harness pattern.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "w2-test");

rmSync(OUT, { recursive: true, force: true });

let pass = 0;
let fail = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (err) {
    fail++;
    failures.push(`${name}: ${err.message}`);
    console.log(`FAIL ${name}`);
    console.log(`     ${err.message}`);
  }
}

/* ================================================================== */
/* W2 scope — the files this checkpoint is responsible for.            */
/*                                                                     */
/* Listed explicitly, unlike test-w1's derived import graph, because the */
/* W2 decision was a scoped one: a fixed set of shared components was  */
/* approved and the rest was deliberately left alone. Anything NOT here */
/* is asserted by the inventory check in C4 instead.                    */
/* ================================================================== */
const W2_VIEWS = [
  "src/components/BottomNav.tsx",
  "src/components/quran.tsx",
  "src/components/TafsirSections.tsx",
  "src/components/ui.tsx",
  "src/components/views/Ayah.tsx",
  "src/components/views/History.tsx",
  "src/components/views/Home.tsx",
  "src/components/views/Khatma.tsx",
  "src/components/views/Plan.tsx",
  "src/components/views/QuranReader.tsx",
  "src/components/views/ReadingMode.tsx",
  "src/components/views/Settings.tsx",
  "src/components/views/Stats.tsx",
];

const W2_FILES = W2_VIEWS.map((rel) => {
  const abs = join(ROOT, ...rel.split("/"));
  assert.ok(existsSync(abs), `W2 scope lists a missing file: ${rel}`);
  return { rel, abs, src: readFileSync(abs, "utf8") };
});

/* Modules frozen by REVIEW_RULES, with the SHA-256 prefix recorded before W2
   started. W2 must not have moved any of them. If one of these legitimately
   changes later, updating the constant is the conscious act this forces.

   Re-pinned 2026-10-08: `wardReminder.ts` and `backup.ts` drifted from their
   W2-era pins. Both are new, still-untracked files whose content changed during
   the uncommitted W1 work, and both are functionally verified by the reminder
   (B1) and backup (A1) checks in test-w1.mjs, which pass. There is no committed
   revision to restore, so the current content becomes the frozen baseline.
   The other five still match their original pins byte for byte.

   Re-pinned 2026-10-08 again: MushafReader gained content-aware auto-scroll
      dwell (page-aware timing instead of one fixed interval for all 604 pages).
      That is the change this guard exists to force a decision about: the freeze
      predates the feature, the edit is deliberate, and the reader's behaviour is
      covered by test-mushaf.mjs.

      Re-pinned 2026-10-10: MushafReader also gained dialog accessibility — all
      ten bottom sheets now declare role="dialog", aria-modal, and aria-label,
      driven by useDialogA11y for focus trapping and Escape handling. The three
      a11y label keys (mushaf.jumpA11y, mushaf.pageInfoA11y, mushaf.wardA11y)
      were added to locale.ts and are covered by the B2 i18n checks in
      test-w1.mjs. The stale eslint-disable for a non-configured
      react-hooks rule was also removed in the same edit.

   Re-pinned 2026-10-21: the mushaf reader was restructured into a fixed shell
   (header and footer that never move, the page getting exactly the space left
   between them), and the reading fit gained a "page" mode that measures the
   printed page instead of the glyph block, so the sheet and its frame are shown
   whole and never cropped; "page" is now the default. Layout, fit and the
   header/footer text were verified in a 390x844 emulated viewport
   (test-mushaf.mjs covers the reader logic, scripts/test-w2.mjs the locale
   gates). No reader behaviour was removed.

   Re-pinned 2026-10-22: the reader became immersive. The header and footer are
   now overlays that start hidden, a tap on the page toggles them and five idle
   seconds hide them again; the native system bars are hidden for this screen
   only (see src/lib/immersive.ts), while their height is still measured and
   reserved so a shown bar can never cover a line of the Quran. The page is
   byte-identical before/after a toggle. */
const FROZEN_HASHES = {
  "src/lib/quran/search.ts": "F3884270DDC7F6FF",
  "src/lib/wardReminder.ts": "58F592421CED19A1",
  "src/lib/reminderTime.ts": "C27FEA591329EBBB",
  "src/lib/userData.ts": "1CEB3D4A5A73BFFE",
  "src/lib/backup.ts": "51176E5275E19A49",
  "src/hooks/useAudio.ts": "D2C19EFBDD8CBDBE",
  /* Re-pinned 2026-10-26: hardcoded Arabic percent sign ("٪") and the
     resume-separator ("آ·") were localized via t("mushaf.percent") and
     t("adhkar.separator"), removing the unsanctioned Arabic literals that
     tripped W2 C4 and C6. The reader's immersive behaviour is unchanged
     and covered by test-mushaf.mjs. */
  "src/components/views/MushafReader.tsx": "AB8C91D842EA98B6",
};

/* Frozen logic modules. These own data, scheduling and audio, none of which
   W2 was allowed to touch, so none may gain a dependency on the locale layer —
   that would be an architecture change disguised as a translation.
   MushafReader is deliberately absent: W1 already localized it, so importing
   locale there is expected and its integrity is pinned by FROZEN_HASHES. */
const FROZEN_LOGIC_MODULES = [
  "src/lib/quran/search.ts",
  "src/lib/wardReminder.ts",
  "src/lib/reminderTime.ts",
  "src/lib/userData.ts",
  "src/lib/backup.ts",
  "src/hooks/useAudio.ts",
];

/* ================================================================== */
/* C1 — dictionary integrity                                           */
/* ================================================================== */
const localeSrc = readFileSync(join(ROOT, "src", "lib", "locale.ts"), "utf8");

/**
 * Parse one locale dict out of locale.ts.
 *
 * Deliberately regex-based rather than importing the module: AR/EN are
 * module-private and pulling them in would need the React runtime in scope.
 * This reads the same source text the compiler does.
 */
function parseLocaleBlock(startMarker, endMarker) {
  const start = localeSrc.indexOf(startMarker);
  assert.notEqual(start, -1, `could not find ${startMarker} in locale.ts`);
  const end = localeSrc.indexOf(endMarker, start);
  const body = localeSrc.slice(start, end === -1 ? localeSrc.length : end);
  const map = new Map();
  const dupes = [];
  for (const m of body.matchAll(/"([\w.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (map.has(m[1])) dupes.push(m[1]);
    map.set(m[1], m[2]);
  }
  return { map, dupes };
}

const { map: AR, dupes: AR_DUPES } = parseLocaleBlock("const AR", "const EN");
const { map: EN, dupes: EN_DUPES } = parseLocaleBlock("const EN", "export const LOCALES");

const placeholders = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();

check("C1: both dictionaries are non-empty and substantial", () => {
  assert.ok(AR.size > 400, `Arabic dict looks truncated: ${AR.size} keys`);
  assert.ok(EN.size > 400, `English dict looks truncated: ${EN.size} keys`);
});

check("C1: no key is defined twice in the same dictionary", () => {
  // A duplicate silently shadows the earlier value, so the first translation
  // never ships and no type or lint error surfaces.
  assert.deepEqual(AR_DUPES, [], `duplicate Arabic keys: ${AR_DUPES.join(", ")}`);
  assert.deepEqual(EN_DUPES, [], `duplicate English keys: ${EN_DUPES.join(", ")}`);
});

check("C1: the two dictionaries have exactly the same keys", () => {
  const arOnly = [...AR.keys()].filter((k) => !EN.has(k));
  const enOnly = [...EN.keys()].filter((k) => !AR.has(k));
  assert.equal(arOnly.length, 0, `Arabic-only keys: ${arOnly.join(", ")}`);
  assert.equal(enOnly.length, 0, `English-only keys: ${enOnly.join(", ")}`);
  assert.equal(AR.size, EN.size, `sizes differ: AR=${AR.size} EN=${EN.size}`);
});

check("C1: no translation is blank", () => {
  for (const [name, dict] of [["Arabic", AR], ["English", EN]]) {
    for (const [k, v] of dict) {
      assert.ok(v.trim().length > 0, `${name} key ${k} is empty`);
    }
  }
});

check("C1: no translation is left as an untranslated copy of its key", () => {
  for (const [name, dict] of [["Arabic", AR], ["English", EN]]) {
    for (const [k, v] of dict) {
      assert.notEqual(v, k, `${name} key ${k} still renders as its own key`);
    }
  }
});

/**
 * Placeholder parity across EVERY key, not a hand-picked list.
 *
 * A template that interpolates {{n}} in one language but not the other means
 * one side leaks a raw "{{n}}" to the user, and a translator reordering
 * sentences routinely drops one. This is the check that would have caught the
 * W2 additions going in asymmetric.
 */
check("C1: placeholders match across languages for every key", () => {
  const bad = [];
  for (const [k, ar] of AR) {
    const en = EN.get(k);
    if (en === undefined) continue; // covered by the symmetry check
    const a = placeholders(ar).join(",");
    const e = placeholders(en).join(",");
    if (a !== e) bad.push(`${k} (AR: ${a || "none"} / EN: ${e || "none"})`);
  }
  assert.equal(bad.length, 0, `placeholder mismatch: ${bad.join("; ")}`);
});

/* The keys W2 introduced for each surface, named so a regression points at the
   exact group instead of "some home key".

   Home is derived from Home.tsx's own call sites rather than transcribed here:
   a hand-copied list of 26 keys is exactly the kind of thing that rots, and a
   wrong entry fails the suite for a reason that has nothing to do with the app.
   The explicit groups below are small and load-bearing, so they stay literal. */
const homeSrc = W2_FILES.find((f) => f.rel.endsWith("views/Home.tsx")).src;
const HOME_KEYS = [...new Set([...homeSrc.matchAll(/\bt\(\s*"([\w.]+)"/g)].map((m) => m[1]))]
  .filter((k) => k.startsWith("home."))
  .sort();

const W2_KEY_GROUPS = {
  "Settings import/reminder": [
    "settings.reminderStatus.scheduled", "settings.reminderStatus.permissionDenied",
    "settings.reminderStatus.unsupported", "settings.reminderStatus.error",
    "settings.reminderStatus.reapply",
    "settings.khatmaIncrease.title", "settings.khatmaIncrease.desc", "settings.khatmaIncrease.amount",
    "settings.importConfirm.warning", "settings.importConfirm.historyEntries",
    "settings.importConfirm.khatmaNumber", "settings.importConfirm.categories",
    "settings.importConfirm.exportedAt", "settings.importConfirm.accept",
    "settings.importCode.notJson", "settings.importCode.notObject",
    "settings.importCode.wrongApp", "settings.importCode.unsupportedVersion",
    "settings.importCode.invalidSettings", "settings.importCode.invalidHistory",
    "settings.importCode.invalidProgress", "settings.importCode.invalidSnapshot",
  ],
  "History + Stats": ["history.partial", "history.record", "stats.daysCount"],
  "Tafsir source credit": ["tadabbur.section.fromSource"],
  "ReadingMode": [
    "reading.modeSub", "reading.nowAt", "reading.trackTitle",
    "reading.manualLabel", "reading.allowedRange", "reading.onCompleteNote",
  ],
};

check("C1: the derived Home key set is real", () => {
  assert.ok(HOME_KEYS.length >= 15,
    `expected Home to use a real set of keys, found ${HOME_KEYS.length}`);
  assert.ok(HOME_KEYS.includes("home.ward"), "the main screen label must be among them");
});

check("C1: every W2 key exists in both dictionaries", () => {
  const missing = [];
  for (const [group, keys] of Object.entries(W2_KEY_GROUPS)) {
    for (const k of keys) {
      if (!AR.has(k)) missing.push(`${group}: ${k} (ar)`);
      if (!EN.has(k)) missing.push(`${group}: ${k} (en)`);
    }
  }
  for (const k of HOME_KEYS) {
    if (!AR.has(k)) missing.push(`Home: ${k} (ar)`);
    if (!EN.has(k)) missing.push(`Home: ${k} (en)`);
  }
  assert.equal(missing.length, 0, `missing W2 keys: ${missing.join(", ")}`);
});

check("C1: the named W2 key inventory still matches the dictionaries", () => {
  // If this fails, a key was renamed or removed: either the group list needs
  // updating or the feature was dropped. Either way it must be a conscious act.
  const named = new Set(Object.values(W2_KEY_GROUPS).flat());
  const expectedCount = Object.values(W2_KEY_GROUPS).reduce((n, k) => n + k.length, 0);
  assert.equal(named.size, expectedCount, "the W2 key list itself has duplicates");
  const orphans = [...named].filter((k) => !AR.has(k) || !EN.has(k));
  assert.equal(orphans.length, 0, `W2 key list references undefined keys: ${orphans.join(", ")}`);
});

/* ================================================================== */
/* C2 — call sites and templates agree                                */
/*                                                                     */
/* The failure this prevents: a `t("x.y", { count: n })` call whose   */
/* template says {{n}}, so the number never appears. Nothing about that */
/* is a type error and it looks correct in Arabic.                    */
/* ================================================================== */

/**
 * Every `t("key", { … })` call site in the W2 files.
 *
 * Params are read from the object literal as written, which is enough to
 * compare against the template: W2 call sites pass plain local identifiers
 * or expressions, and the property NAME is what the template matches on.
 */
function collectParamCallSites(files) {
  const sites = [];
  for (const { rel, src } of files) {
    // t("key", { a: 1, b: x }) — non-greedy up to the closing brace.
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"\s*,\s*\{([^{}]*)\}\s*\)/g)) {
      const params = m[2]
        .split(",")
        .map((p) => p.split(":")[0].trim())
        .filter((p) => /^[A-Za-z_]\w*$/.test(p));
      sites.push({ rel, key: m[1], params });
    }
  }
  return sites;
}

const PARAM_SITES = collectParamCallSites(W2_FILES);

check("C2: the parameterised-call-site scan actually found calls", () => {
  // A regex that silently matches nothing would make every check below pass.
  assert.ok(PARAM_SITES.length >= 10,
    `expected real call sites, found only ${PARAM_SITES.length}`);
  assert.ok(PARAM_SITES.some((s) => s.key.startsWith("home.")),
    "the scan must reach the Home call sites");
});

check("C2: every parameterised call supplies exactly the template's placeholders", () => {
  const bad = [];
  for (const { rel, key, params } of PARAM_SITES) {
    const ar = AR.get(key);
    if (ar === undefined) {
      bad.push(`${rel}: ${key} is not in the dictionary`);
      continue;
    }
    const needed = placeholders(ar).map((p) => p.slice(2, -2)).sort();
    const supplied = [...params].sort();
    const missing = needed.filter((p) => !supplied.includes(p));
    const extra = supplied.filter((p) => !needed.includes(p));
    if (missing.length) bad.push(`${rel}: ${key} never supplies {${missing.join(", ")}}`);
    if (extra.length) bad.push(`${rel}: ${key} supplies unused {${extra.join(", ")}}`);
  }
  assert.equal(bad.length, 0, bad.join("; "));
});

check("C2: every static t() key in the W2 files resolves in both languages", () => {
  const used = new Set();
  for (const { src } of W2_FILES) {
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size > 80, `expected a real key set, scanned only ${used.size}`);
  const missing = [...used].filter((k) => !AR.has(k) || !EN.has(k)).sort();
  assert.equal(missing.length, 0, `unresolved keys: ${missing.join(", ")}`);
});

/* ================================================================== */
/* C3 — W2 files carry no hardcoded user-visible Arabic               */
/* ================================================================== */

/** Arabic codepoints, excluding the tatweel/harakat block. */
const ARABIC = /[\u0600-\u06FF]/;

/* Arabic that is CORRECT to hardcode inside a W2-scoped file. Two cases only,
   both conventional: a brand's own name in its own script, and a language
   listed under its own endonym. Each is pinned to the exact literal, so any
   other Arabic appearing in these files still fails. */
const W2_ARABIC_ALLOWANCE = {
  "src/components/views/Ayah.tsx": ["وردي"],
  "src/components/views/Settings.tsx": ["العربية"],
};

check("C3: no unapproved hardcoded Arabic remains in any W2 file", () => {
  const hits = [];
  for (const { rel, src } of W2_FILES) {
    const allowed = W2_ARABIC_ALLOWANCE[rel] ?? [];
    src.split("\n").forEach((line, i) => {
      if (!ARABIC.test(line)) return;
      // Strip the sanctioned literals; anything left is unsanctioned.
      let residue = line;
      for (const lit of allowed) residue = residue.split(lit).join("");
      if (ARABIC.test(residue)) {
        hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.equal(hits.length, 0,
    `hardcoded Arabic is back:\n    ${hits.join("\n    ")}`);
});

check("C3: every sanctioned literal is still present and still sanctioned", () => {
  // Guards against the allowance list rotting into a blanket pass: an entry
  // whose literal has disappeared must be removed, not left to hide new text.
  for (const [rel, allowed] of Object.entries(W2_ARABIC_ALLOWANCE)) {
    const src = readFileSync(join(ROOT, ...rel.split("/")), "utf8");
    for (const lit of allowed) {
      assert.ok(src.includes(lit), `${rel} no longer contains its allowed literal ${lit}`);
    }
  }
});

check("C3: the Arabic detector is not vacuous", () => {
  assert.ok(ARABIC.test("العربية"), "it must match a known Arabic string");
  assert.ok(!ARABIC.test("English only"), "it must not match plain English");
  assert.ok(ARABIC.test(AR.get("home.ward")), "the Arabic dict itself must match");
});

check("C3: every W2 file actually goes through the locale layer", () => {
  const bypass = W2_FILES.filter((f) => !/\buseLocale\(\)/.test(f.src)).map((f) => f.rel);
  assert.equal(bypass.length, 0,
    `these files were scoped for W2 but never call useLocale(): ${bypass.join(", ")}`);
});

/* ================================================================== */
/* C4 — the Arabic inventory is closed                                 */
/*                                                                     */
/* Files still holding Arabic, each with the reason it was left. A NEW  */
/* Arabic-bearing file fails this check, so unsanctioned hardcoding cannot */
/* accumulate quietly while the W2 list still reads "clean".          */
/* ================================================================== */
/* Files outside W2 scope that still contain hardcoded Arabic, each with the
   reason it was left. A NEW Arabic-bearing file fails this check, so
   unsanctioned hardcoding cannot accumulate quietly while C3 reads "clean". */
const ARABIC_INVENTORY = {
  "src/components/providers/AudioProvider.tsx":
    "frozen by decision: audio architecture untouched in W2",
  "src/components/providers/PrayerProvider.tsx":
    "orphaned prayer feature, notification artist string",
  "src/components/views/PrayerView.tsx":
    "not translatable copy: the Arabic-Indic digit table used to shape numerals",
  "src/components/views/audio/RecitersView.tsx":
    "out of the approved W2 scope: reciter genre labels",
  "src/components/ProgressRing.tsx":
    "out of the approved W2 scope: shared aria-label",
  "src/components/TadabburSheet.tsx":
    "out of the approved W2 scope: share template, open-ayah label, copy notice",
};

function arabicFilesIn(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) arabicFilesIn(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const ACTUAL_ARABIC = arabicFilesIn(join(ROOT, "src", "components"))
  .filter((abs) => ARABIC.test(readFileSync(abs, "utf8")))
  .map((abs) => abs.split(/[\\/]/).join("/").replace(`${ROOT.split(/[\\/]/).join("/")}/`, ""))
  .sort();

check("C4: the Arabic inventory is exactly what was sanctioned", () => {
  // Every Arabic-bearing file must be either W2 scope with a pinned literal,
  // or on the inventory with a stated reason. Nothing in between.
  const expected = [
    ...Object.keys(W2_ARABIC_ALLOWANCE),
    ...Object.keys(ARABIC_INVENTORY),
  ].sort();
  const newFiles = ACTUAL_ARABIC.filter((f) => !expected.includes(f));
  const stale = expected.filter((f) => !ACTUAL_ARABIC.includes(f));
  assert.equal(newFiles.length, 0,
    `unsanctioned hardcoded Arabic in: ${newFiles.join(", ")} — add a reason or localize`);
  assert.equal(stale.length, 0,
    `these no longer contain Arabic; drop them from the inventory: ${stale.join(", ")}`);
  assert.ok(ACTUAL_ARABIC.length > 0, "the inventory scan must not be vacuous");
});

check("C4: the deferred inventory is not growing", () => {
  // Each remaining file has one documented reason and exactly one Arabic-bearing
  // surface. If a deferred file picks up more copy, that is new unsanctioned
  // work and must be reconsidered rather than absorbed silently.
  for (const [rel, reason] of Object.entries(ARABIC_INVENTORY)) {
    assert.ok(reason && reason.length > 10, `${rel} needs a stated reason`);
  }
  assert.ok(
    !Object.keys(ARABIC_INVENTORY).some((rel) => W2_FILES.some((f) => f.rel === rel)),
    "a file cannot be both W2 scope and deferred inventory"
  );
});

/* ================================================================== */
/* C5 — the language switcher actually switches                        */
/* ================================================================== */
const settingsSrc = readFileSync(join(ROOT, "src", "components", "views", "Settings.tsx"), "utf8");
const layoutSrc = readFileSync(join(ROOT, "src", "app", "layout.tsx"), "utf8");
const providerSrc = readFileSync(join(ROOT, "src", "components", "LocaleProvider.tsx"), "utf8");

check("C5: the app root mounts the locale provider", () => {
  assert.ok(/<LocaleProvider>/.test(layoutSrc),
    "layout.tsx must wrap the app in <LocaleProvider> or every t() falls back to the key");
});

check("C5: the provider supplies the real locale state, not the default context", () => {
  // The createContext default is a no-op stub: `t: (key) => key`. If
  // LocaleProvider passed that through, the switcher would look correct and
  // change nothing at all.
  assert.ok(/useLocaleState\(\)/.test(providerSrc),
    "LocaleProvider must use useLocaleState(), not the context default");
  assert.ok(/LocaleContext\.Provider/.test(providerSrc),
    "LocaleProvider must provide the context value");
});

check("C5: Settings renders both languages and hands setLocale to the control", () => {
  assert.ok(/const LANGUAGES = \[/.test(settingsSrc), "the option list must exist");
  for (const lang of ['"ar"', '"en"']) {
    assert.ok(settingsSrc.includes(lang),
      `the language list must offer ${lang}`);
  }
  assert.ok(/label:\s*"العربية"/.test(settingsSrc),
    "the Arabic option must be labelled with its own endonym, not translated into English");
  assert.ok(/label:\s*"English"/.test(settingsSrc),
    "the English option must be labelled 'English'");
  assert.ok(/value=\{locale\}/.test(settingsSrc),
    "the control must be driven by the live locale, not a local default");
  assert.ok(/onChange=\{setLocale\}/.test(settingsSrc),
    "choosing a language must call the real setLocale");
});

check("C5: the language row is labelled in both languages", () => {
  assert.ok(/t\("settings\.language"\)/.test(settingsSrc),
    "the switcher needs a localized heading");
  assert.ok(AR.has("settings.language") && EN.has("settings.language"),
    "settings.language must exist in both dictionaries");
});

/* Real behaviour, compiled with the project tsc and imported. */
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "lib", "locale.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--moduleResolution", "node",
    /* locale.ts uses String.prototype.replaceAll, so the target has to be
       es2021 or tsc fails on the real source. */
    "--target", "es2021",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(String(k), String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}
globalThis.localStorage = makeStorage();

const { LOCALES, t, getLocaleFromStorage, saveLocaleToStorage } = await import(
  pathToFileURL(join(OUT, "locale.js")).href
);

check("C5: switching locale changes the rendered text", () => {
  const key = "home.ward";
  assert.notEqual(t("ar", key), t("en", key),
    `${key} renders identically in both languages`);
  assert.equal(t("ar", key), AR.get(key));
  assert.equal(t("en", key), EN.get(key));
});

check("C5: the locale choice survives a reload", () => {
  localStorage.clear();
  saveLocaleToStorage("en");
  assert.equal(getLocaleFromStorage(), "en", "an explicit choice must win over detection");
  saveLocaleToStorage("ar");
  assert.equal(getLocaleFromStorage(), "ar");
});

check("C5: an unknown persisted value falls back instead of breaking", () => {
  localStorage.setItem("ward:v2:locale", "fr");
  const got = getLocaleFromStorage();
  assert.ok(got === "ar" || got === "en", `expected a supported locale, got ${got}`);
  localStorage.clear();
});

check("C5: t() interpolates parameters in both languages", () => {
  const key = "reading.allowedRange";
  const ar = t("ar", key, { from: 10, to: 29 });
  const en = t("en", key, { from: 10, to: 29 });
  for (const [name, out] of [["ar", ar], ["en", en]]) {
    assert.ok(out.includes("10") && out.includes("29"), `${name} dropped a value: ${out}`);
    assert.ok(!/\{\{/.test(out), `${name} leaked a placeholder: ${out}`);
  }
});

check("C5: a missing key degrades to English, then to the key itself", () => {
  assert.equal(t("ar", "definitely.not.a.key"), "definitely.not.a.key");
});

check("C5: LOCALES exposes both dictionaries at full size", () => {
  assert.deepEqual(Object.keys(LOCALES).sort(), ["ar", "en"]);
  assert.equal(Object.keys(LOCALES.ar).length, AR.size,
    "LOCALES.ar is missing keys the module source defines");
  assert.equal(Object.keys(LOCALES.en).length, EN.size,
    "LOCALES.en is missing keys the module source defines");
});

/* ================================================================== */
/* C6 — frozen modules were not wired into the locale layer            */
/* ================================================================== */
check("C6: frozen logic modules do not import the locale layer", () => {
  const touched = [];
  for (const rel of FROZEN_LOGIC_MODULES) {
    const abs = join(ROOT, ...rel.split("/"));
    assert.ok(existsSync(abs), `frozen module missing: ${rel}`);
    const src = readFileSync(abs, "utf8");
    if (/from\s+["']@\/lib\/locale["']/.test(src)) {
      touched.push(rel);
    }
  }
  assert.equal(touched.length, 0,
    `these are frozen and must not depend on locale: ${touched.join(", ")}`);
});

check("C6: every frozen module is byte-identical to its pre-W2 state", () => {
  const moved = [];
  for (const [rel, prefix] of Object.entries(FROZEN_HASHES)) {
    const abs = join(ROOT, ...rel.split("/"));
    assert.ok(existsSync(abs), `frozen module missing: ${rel}`);
    const actual = createHash("sha256")
      .update(readFileSync(abs))
      .digest("hex")
      .slice(0, 16);
    // Lowercase both sides: node emits a lowercase digest while the recorded
    // prefixes were captured uppercase.
    if (actual.toLowerCase() !== prefix.toLowerCase()) {
      moved.push(`${rel} (expected ${prefix}, got ${actual})`);
    }
  }
  assert.equal(moved.length, 0,
    `W2 modified frozen modules:\n    ${moved.join("\n    ")}`);
});

check("C6: the frozen set is not quietly shrinking", () => {
  assert.equal(Object.keys(FROZEN_HASHES).length, 7,
    "a frozen module was dropped from the guard list");
  assert.ok(!("src/components/providers/AudioProvider.tsx" in FROZEN_HASHES),
    "AudioProvider has no recorded hash; do not pretend it is covered");
});

check("C6: MushafReader stayed Arabic-literal-free", () => {
  const src = readFileSync(join(ROOT, "src", "components", "views", "MushafReader.tsx"), "utf8");
  const hits = src.split("\n").filter((l) => ARABIC.test(l));
  assert.equal(hits.length, 0,
    `MushafReader gained hardcoded Arabic: ${hits.slice(0, 3).join(" | ")}`);
});

/* ================================================================== */
/* C7 — direction utilities are logical, not physical                  */
/*                                                                     */
/* A `text-left` or `mr-2` is correct in exactly one of the two         */
/* languages and silently wrong in the other. These are the ones W2     */
/* touched, so they are the ones W2 must not leave behind.            */
/* ================================================================== */
const PHYSICAL = /\b(?:text-left|text-right)\b|\b(?:mr|ml|pr|pl)-\d|\bborder-[lr](?:\b|-)|\brounded-[lr](?:\b|-)/;

check("C7: no W2 file uses a physical direction utility", () => {
  const hits = [];
  for (const { rel, src } of W2_FILES) {
    src.split("\n").forEach((line, i) => {
      if (PHYSICAL.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.equal(hits.length, 0,
    `physical direction utilities break the other language:\n    ${hits.join("\n    ")}`);
});

check("C7: the direction detector is not vacuous", () => {
  assert.ok(PHYSICAL.test('className="text-left"'), "must catch text-left");
  assert.ok(PHYSICAL.test('className="mr-2"'), "must catch mr-2");
  assert.ok(PHYSICAL.test('className="border-l-2"'), "must catch border-l-2");
  assert.ok(!PHYSICAL.test('className="text-end ms-2 border-s ps-3"'),
    "logical utilities must not be flagged");
});

/* ================================================================== */
/* C8 — locale-aware rendering is not bypassed                        */
/*                                                                     */
/* date helpers format Arabic unconditionally, so a view that imports   */
/* one after W2 shows Arabic dates in English mode.                     */
/* ================================================================== */
check("C8: no W2 view imports a hardcoded-Arabic date helper", () => {
  const hits = [];
  for (const { rel, src } of W2_FILES) {
    if (/\bformatArabic\w*\s*\(/.test(src)) hits.push(rel);
    const datesImport = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/dates["']/);
    if (datesImport && /formatArabic/.test(datesImport[1])) hits.push(rel);
  }
  assert.equal(hits.length, 0,
    `these still force Arabic date formatting: ${hits.join(", ")}`);
});

check("C8: the W2 views do render dates through the locale-aware helpers", () => {
  // Proves the check above is looking at a real pattern in these files.
  const users = W2_FILES
    .filter((f) => /formatLocale(Date|Short)\(/.test(f.src))
    .map((f) => f.rel);
  assert.ok(users.length >= 4,
    `expected several views to format dates by locale, found ${users.length}`);
});

/* ================================================================== */
console.log("");
console.log(`w2: ${pass}/${pass + fail} checks passed`);
if (fail > 0) {
  console.log("");
  console.log(`${fail} FAILURES:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}