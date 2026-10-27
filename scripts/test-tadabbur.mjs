/* ====================================================================
 * Tadabbur journal reachability -- focused coverage
 * ====================================================================
 * The audit found that the complete, already-localized Tadabbur flow
 * (src/components/views/TadabburSection.tsx) had ZERO importers, while
 * the reachable TadabburSheet only called completeTadabbur() and never
 * wrote the journal. So `ward:v2:journal` was registered for backup and
 * reset, had a full type + load/save/sanitize API, and no live writer.
 *
 * This harness pins the fix and, unlike the existing suites, actually
 * walks the import graph -- the specific blind spot that let the defect
 * survive 256 green checks. Scope is deliberately narrow: tadabbur
 * reachability and journal persistence only. No suite rewrite, no
 * general-purpose unused-key sweep.
 *
 * What is executed for real: the compiled storage module, against a
 * localStorage stub. What is asserted statically: hook internals
 * (useQuran's useCallback bodies) and component wiring, because running
 * a React hook would need a renderer and adding one is out of scope.
 * ==================================================================== */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "tadabbur-test");

const rel = (abs) => abs.split(/[\\/]/).join("/").replace(`${ROOT.split(/[\\/]/).join("/")}/`, "");
const read = (r) => readFileSync(join(ROOT, ...r.split("/")), "utf8");

/* ---------------------------------------------------------------- */
/* Import-graph walker, seeded from the two real entry points.       */
/* ---------------------------------------------------------------- */

const EXT_CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const ext of EXT_CANDIDATES) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function walk(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    const specs = [
      ...src.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const s of specs) {
      const r = resolveSpec(s, file);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
}

const REACHABLE = walk([
  join(ROOT, "src", "app", "page.tsx"),
  join(ROOT, "src", "app", "layout.tsx"),
]);
const REACHABLE_REL = new Set([...REACHABLE].map(rel));
/** Every reachable file's source, for "does anything live call X" questions. */
const REACHABLE_SRC = [...REACHABLE].map((f) => ({ rel: rel(f), src: readFileSync(f, "utf8") }));

const SECTION = "src/components/views/TadabburSection.tsx";
const SHEET = "src/components/TadabburSheet.tsx";
const JOURNAL_KEY = "ward:v2:journal";

/* ---------------------------------------------------------------- */
/* Compile the real storage module so the journal path is executed.  */
/* ---------------------------------------------------------------- */

rmSync(OUT, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "lib", "storage.ts"),
    "--outDir", OUT,
    "--module", "commonjs", "--moduleResolution", "node",
    "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
};

const storage = await import(pathToFileURL(join(OUT, "storage.js")).href);

/* ---------------------------------------------------------------- */

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/* ---- A. TadabburSection is reachable from the real app graph ---- */

check("A1: the walker actually reaches the app shell", () => {
  assert.ok(REACHABLE_REL.has("src/app/page.tsx"));
  assert.ok(REACHABLE_REL.has("src/components/views/Home.tsx"));
  assert.ok(REACHABLE_SRC.length > 40, `only ${REACHABLE_SRC.length} files reachable`);
});

check("A2: TadabburSection is reachable from the real entry points", () => {
  assert.ok(
    REACHABLE_REL.has(SECTION),
    `${SECTION} is still orphaned: nothing reachable imports it`
  );
});

check("A3: the reachable TadabburSheet renders TadabburSection", () => {
  assert.ok(REACHABLE_REL.has(SHEET), `${SHEET} must stay the reachable entry point`);
  assert.ok(
    /import\s*\{[^}]*TadabburSection[^}]*\}\s*from\s*["']@\/components\/views\/TadabburSection["']/.test(read(SHEET)),
    `${SHEET} must import the complete implementation, not re-declare it`
  );
  assert.ok(/<TadabburSection\b/.test(read(SHEET)), `${SHEET} must render <TadabburSection>`);
});

check("A4: the sheet delegates reflection instead of duplicating it", () => {
  const src = read(SHEET);
  // The minimal sheet owned a private tafsir render + its own done button.
  // If either returns, we are back to two parallel implementations.
  assert.ok(!/<TafsirSections\b/.test(src), `${SHEET} re-renders tafsir itself`);
  assert.ok(!/\btiming|timerSeconds|personalNote/.test(src), `${SHEET} re-implements the flow`);
  assert.ok(!/quran\.completeTadabbur\(\)/.test(src), `${SHEET} must not own completion any more`);
});

/* ---- B. ward:v2:journal has a reachable writer ---- */

check("B1: the journal key is the one backup and reset know about", () => {
  assert.match(read("src/lib/storage.ts"), new RegExp(`V2_JOURNAL = "${JOURNAL_KEY}"`));
  assert.ok(
    read("src/lib/userData.ts").includes(`"${JOURNAL_KEY}"`),
    "journal must stay in the userData registry (backup + reset)"
  );
});

check("B2: a reachable file writes the journal", () => {
  const writers = REACHABLE_SRC.filter((f) => /saveTadabburJournal\s*\(/.test(f.src));
  assert.ok(writers.length > 0, `no reachable writer for ${JOURNAL_KEY}`);
  assert.ok(
    writers.some((f) => f.rel === SECTION),
    `the complete implementation should own the write, found: ${writers.map((f) => f.rel).join(", ")}`
  );
});

check("B3: a reachable file reads the journal back", () => {
  const readers = REACHABLE_SRC.filter((f) => /loadTadabburJournal\s*\(/.test(f.src));
  assert.ok(readers.some((f) => f.rel === SECTION), `no reachable reader, found: ${readers.map((f) => f.rel).join(", ")}`);
});

check("B4: the component loads the journal on mount", () => {
  const src = read(SECTION);
  assert.match(src, /useEffect\(\(\)\s*=>\s*\{\s*setJournal\(loadTadabburJournal\(\)\)/s);
});

/* ---- C. Journal save/load round-trips ---- */

const entry = (ref, over = {}) => ({
  ref,
  date: "2026-01-02",
  completedAt: "2026-01-02T03:04:05.000Z",
  appliedStep: true,
  personalNote: "note for " + ref,
  ...over,
});

check("C1: a saved entry reads back identically", () => {
  storage.saveTadabburJournal([entry("2:255")]);
  const loaded = storage.loadTadabburJournal();
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded[0], entry("2:255"));
});

check("C2: save overwrites previous state rather than appending", () => {
  storage.saveTadabburJournal([entry("2:255"), entry("3:2")]);
  storage.saveTadabburJournal([entry("18:10")]);
  assert.deepEqual(
    storage.loadTadabburJournal().map((e) => e.ref),
    ["18:10"]
  );
});

check("C3: storage keeps only the newest 100 entries", () => {
  const many = Array.from({ length: 130 }, (_, i) => entry(`1:${i + 1}`));
  storage.saveTadabburJournal(many);
  const loaded = storage.loadTadabburJournal();
  assert.equal(loaded.length, 100);
  assert.equal(loaded.at(-1).ref, "1:130", "the newest entry must survive the cap");
  assert.ok(!loaded.some((e) => e.ref === "1:1"), "the oldest entry must be dropped");
});

check("C4: the component replaces same-ayah entries instead of duplicating", () => {
  const src = read(SECTION);
  assert.ok(
    /journal\.filter\(\(e\) => e\.ref !== candidate\)/.test(src),
    "re-completing the same ayah must replace its entry, not append a second one"
  );
  assert.ok(/\.slice\(-100\)/.test(src), "the component must apply the same 100-entry cap");
});

/* ---- D. Journal data stays sanitized ---- */

check("D1: malformed entries are dropped, valid ones survive", () => {
  store[JOURNAL_KEY] = JSON.stringify([
    entry("2:255"),
    null,
    "nope",
    { ref: "3:2" }, // no date
    { date: "2026-01-02" }, // no ref
    { ref: "4:3", date: "not-a-date" },
    entry("5:4"),
  ]);
  assert.deepEqual(
    storage.loadTadabburJournal().map((e) => e.ref),
    ["2:255", "5:4"]
  );
});

check("D2: field types are coerced, never trusted", () => {
  store[JOURNAL_KEY] = JSON.stringify([
    {
      ref: "2:255",
      date: "2026-01-02",
      completedAt: 12345, // wrong type
      appliedStep: "yes", // wrong type
      personalNote: { evil: true }, // wrong type
      extra: "dropped",
    },
  ]);
  const [e] = storage.loadTadabburJournal();
  assert.equal(e.completedAt, "2026-01-02", "completedAt falls back to date");
  assert.equal(e.appliedStep, false, "appliedStep only accepts true");
  assert.equal(e.personalNote, "");
  assert.ok(!("extra" in e), "unknown fields must not survive");
});

check("D3: corrupt JSON degrades to an empty journal", () => {
  store[JOURNAL_KEY] = "{not json";
  assert.deepEqual(storage.loadTadabburJournal(), []);
  store[JOURNAL_KEY] = JSON.stringify({ not: "an array" });
  assert.deepEqual(storage.loadTadabburJournal(), []);
});

check("D4: a missing key is not an error", () => {
  delete store[JOURNAL_KEY];
  assert.deepEqual(storage.loadTadabburJournal(), []);
});

/* ---- E. Completing tadabbur still advances Quran-side progress ---- */

check("E1: completeTadabbur sets the same progress fields as before", () => {
  const src = read("src/hooks/useQuran.ts");
  const body = /const completeTadabbur = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(src)?.[1];
  assert.ok(body, "completeTadabbur not found in useQuran");
  assert.ok(/tadabburDone: true/.test(body), "must mark tadabburDone");
  assert.ok(/read: true/.test(body), "must mark read");
  assert.ok(/deferred: false/.test(body), "must clear deferred");
  assert.ok(/saveWardDay\(next\)/.test(body), "must persist through saveWardDay");
});

check("E2: a reachable file calls completeTadabbur", () => {
  const callers = REACHABLE_SRC.filter((f) => /quran\.completeTadabbur\(\)|\{ completeTadabbur \}/.test(f.src) || /completeTadabbur\(\);/.test(f.src));
  assert.ok(callers.some((f) => f.rel === SECTION), "the complete flow must own completion");
  assert.ok(callers.length >= 1);
});

check("E3: completion and the journal write happen in one handler", () => {
  const src = read(SECTION);
  const handler = /const markStepDone = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/.exec(src)?.[1];
  assert.ok(handler, "markStepDone not found");
  assert.ok(/saveTadabburJournal\(next\)/.test(handler), "must persist the journal");
  assert.ok(/completeTadabbur\(\)/.test(handler), "must advance Quran progress");
  // Order matters: the journal must be written before the completion that
  // re-renders the completed card, so a failure cannot leave progress
  // advanced with nothing recorded.
  assert.ok(
    handler.indexOf("saveTadabburJournal(next)") < handler.indexOf("completeTadabbur()"),
    "journal write must precede the progress update"
  );
});

check("E4: the persisted ward day round-trips the progress fields", () => {
  // The real WardDay shape is exactly { date, ayahId, read, tadabburDone,
  // deferred } -- the three fields completeTadabbur writes plus the identity.
  const day = {
    date: "2026-01-02",
    ayahId: "2:255",
    read: true,
    tadabburDone: true,
    deferred: false,
  };
  storage.saveWardDay(day);
  assert.deepEqual(storage.loadWardDay(), day);
});

check("E5: the ward day sanitizer keeps only known fields", () => {
  store["ward:v2:wardday"] = JSON.stringify({
    date: "2026-01-02",
    ayahId: "2:255",
    read: true,
    tadabburDone: true,
    deferred: false,
    injected: "should not survive",
  });
  assert.deepEqual(Object.keys(storage.loadWardDay()).sort(), [
    "ayahId", "date", "deferred", "read", "tadabburDone",
  ]);
});

/* ---- F. Deferring still works ---- */

check("F1: deferTadabbur sets deferred and persists", () => {
  const src = read("src/hooks/useQuran.ts");
  const body = /const deferTadabbur = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(src)?.[1];
  assert.ok(body, "deferTadabbur not found");
  assert.ok(/deferred: true/.test(body));
  assert.ok(/saveWardDay\(next\)/.test(body));
});

check("F2: both defer entry points stay reachable", () => {
  assert.ok(/quran\.deferTadabbur/.test(read("src/components/views/Home.tsx")), "Home keeps its defer button");
  assert.ok(/quran\.deferTadabbur/.test(read(SECTION)), "the sheet flow keeps its defer button");
});

check("F3: the deferred notice is still rendered by the complete flow", () => {
  assert.ok(/wardDay\?\.deferred && !wardDay\.tadabburDone/.test(read(SECTION)));
});

/* ---- G. No duplicate tadabbur route, tab or entry point ---- */

check("G1: no tadabbur member was added to the tab or full-view unions", () => {
  const types = read("src/lib/types.ts");
  const tab = /export type TabId =([^;]+);/.exec(types)?.[1] ?? "";
  const full = /export type FullViewId =([^;]+);/.exec(types)?.[1] ?? "";
  assert.ok(tab && full, "TabId / FullViewId unions not found");
  assert.ok(!/tadabbur/i.test(tab), "TabId must not gain a tadabbur tab");
  assert.ok(!/tadabbur/i.test(full), "FullViewId must not gain a tadabbur screen");
});

check("G2: page.tsx still mounts exactly one tadabbur surface", () => {
  const page = read("src/app/page.tsx");
  const mounts = page.match(/<TadabburSheet\b/g) ?? [];
  assert.equal(mounts.length, 1, "exactly one TadabburSheet mount expected");
  assert.equal((page.match(/<TadabburSection\b/g) ?? []).length, 0, "page must not mount a second surface");
  assert.match(page, /import\s*\{\s*TadabburSheet\s*\}\s*from\s*["']@\/components\/TadabburSheet["']/);
});

check("G3: the Home entry point is unchanged", () => {
  const page = read("src/app/page.tsx");
  assert.match(page, /onOpenTadabbur=\{\(\) => setShowTadabbur\(true\)\}/);
  const home = read("src/components/views/Home.tsx");
  assert.match(home, /onOpenTadabbur\(\)/, "Home still opens the sheet");
});

check("G4: no second file opens a tadabbur surface", () => {
  const openers = REACHABLE_SRC.filter((f) => /setShowTadabbur|onOpenTadabbur\(\)/.test(f.src));
  assert.deepEqual(
    openers.map((f) => f.rel).sort(),
    ["src/app/page.tsx", "src/components/views/Home.tsx"]
  );
});

check("G5: no new route file was added", () => {
  const pages = readdirSync(join(ROOT, "src", "app"))
    .filter((f) => f.endsWith("page.tsx") || f.endsWith("page.jsx") || f.endsWith("page.js"));
  assert.deepEqual(pages, ["page.tsx"], "src/app must still hold exactly one page");
});

/* ---- H. No new persistence key, no new translation key ---- */

check("H1: the storage key inventory is unchanged", () => {
  const src = read("src/lib/storage.ts");
  const keys = [...src.matchAll(/const (?:V2|LEGACY)_\w+ = "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, [
    "ward:v2:settings", "ward:v2:history", "ward:v2:progress", "ward:v2:daily",
    "ward:v2:bookmarks", "ward:v2:wardday", "ward:v2:journal",
    "ward:v2:quran-progress", "ward-settings", "ward-history",
  ]);
});

check("H2: the tadabbur translation key inventory is unchanged", () => {
  const locale = read("src/lib/locale.ts");
  const keys = [...new Set([...locale.matchAll(/"(tadabbur\.[\w.]+)":/g)].map((m) => m[1]))];
  assert.deepEqual(keys, [
    "tadabbur.title", "tadabbur.subtitle", "tadabbur.verseOf", "tadabbur.deferred",
    "tadabbur.start", "tadabbur.defer", "tadabbur.timerTitle", "tadabbur.timerStart",
    "tadabbur.timerDone", "tadabbur.stepTitle", "tadabbur.stepDone", "tadabbur.stepTodo",
    "tadabbur.reflectTitle", "tadabbur.reflectPlaceholder", "tadabbur.reflectSave",
    "tadabbur.reflectHint", "tadabbur.celebrate", "tadabbur.completed", "tadabbur.retake",
    "tadabbur.source", "tadabbur.section.tafsir", "tadabbur.section.tafsirSub",
    "tadabbur.section.fromSource", "tadabbur.section.simple", "tadabbur.section.simpleSub",
    "tadabbur.section.live", "tadabbur.section.liveSub", "tadabbur.section.reflect",
    "tadabbur.section.reflectSub", "tadabbur.noData", "tadabbur.loading",
    /* Added with the fallback path: only 24 ayahs have a curated tafsir entry,
       so the sheet now renders without one and says so instead of vanishing.
       These two carry that message, in both languages. */
    "tadabbur.noTafsirTitle", "tadabbur.noTafsirHint",
  ]);
});

check("H3: the sheet takes its title from the locale layer", () => {
  const src = read(SHEET);
  assert.match(src, /useLocale\(\)/, "the sheet must resolve its own title");
  assert.ok(!/title="[^"]*[\u0600-\u06FF]/.test(src), "the sheet title must not be a hardcoded literal");
});

/* ---------------------------------------------------------------- */

for (const { name, fn } of checks) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nTadabbur journal reachability: ${passed}/${checks.length} passed`);
if (passed !== checks.length) {
  console.error(`${checks.length - passed} check(s) failed.`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
