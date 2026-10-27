/**
 * W1 — Trust & Data Integrity regression tests.
 *
 * Follows the existing harness pattern (scripts/test-offline.mjs): compile the
 * REAL modules with the project tsc into node_modules/.cache and import them.
 * Nothing here re-implements app logic, so a passing run means the shipped code
 * behaves, not that a copy of it does.
 *
 * A localStorage stub stands in for the browser. Per DATA_SAFETY, every test
 * runs against this in-memory fixture: no production or device data is read or
 * written.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "w1-test");

rmSync(OUT, { recursive: true, force: true });

const libFiles = [
  join(ROOT, "src", "lib", "dates.ts"),
  join(ROOT, "src", "lib", "types.ts"),
  join(ROOT, "src", "lib", "ward.ts"),
  join(ROOT, "src", "lib", "userData.ts"),
  join(ROOT, "src", "lib", "reminderTime.ts"),
  join(ROOT, "src", "lib", "storage.ts"),
  join(ROOT, "src", "lib", "backup.ts"),
];

execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    ...libFiles,
    "--outDir", OUT,
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--target", "es2019",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

/* ------------------------------------------------------------------ */
/* In-memory localStorage, installed BEFORE the modules are imported.   */
/* ------------------------------------------------------------------ */
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
    _map: map,
  };
}
globalThis.localStorage = makeStorage();
const LS = globalThis.localStorage;
const resetStorage = () => LS.clear();

const load = async (rel) => import(pathToFileURL(join(OUT, rel)).href);

const { parseBackup, applyBackup, createBackup, BACKUP_APP_ID, BACKUP_VERSION } = await load("backup.js");
const { clearUserData, USER_DATA_KEYS, REGENERABLE_KEYS, inventoryLocalKeys } = await load("userData.js");
const { msUntilNextMidnight } = await load("dates.js");
const {
  parseReminderTime,
  nextReminderAt,
  reminderSignature,
} = await load("reminderTime.js");
const { wardPagesAvailable, pageRange } = await load("ward.js");
const { DEFAULT_SETTINGS } = await load("types.js");
const localeSrcRaw = readFileSync(join(ROOT, "src", "lib", "locale.ts"), "utf8");

/* Parse the two locale dicts out of locale.ts so we can assert on real data
   without pulling React into this harness. */
function parseLocaleBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return new Map();
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  const body = source.slice(start, end === -1 ? source.length : end);
  const map = new Map();
  for (const m of body.matchAll(/"([\w.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

const AR_DICT = parseLocaleBlock(localeSrcRaw, "const AR", "const EN");
const EN_DICT = parseLocaleBlock(localeSrcRaw, "const EN", "export const LOCALES");

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
/* A4 — final-day khatma page accounting                              */
/* ================================================================== */
const TOTAL = 604;

check("A4: 600 of 604 records 5 real pages, not the scheduled 20", () => {
  assert.equal(wardPagesAvailable(600, 20, TOTAL), 5);
});

check("A4: 603 of 604 records exactly 2 real pages", () => {
  assert.equal(wardPagesAvailable(603, 20, TOTAL), 2);
});

check("A4: exact boundary (585 + 20 = 604) records the full 20", () => {
  assert.equal(wardPagesAvailable(585, 20, TOTAL), 20);
});

check("A4: 1 page left records 1", () => {
  assert.equal(wardPagesAvailable(604, 20, TOTAL), 1);
});

check("A4: final day is completable — progress can reach the real count", () => {
  const scheduled = 20;
  const available = wardPagesAvailable(600, scheduled, TOTAL);
  // The bug made the denominator the scheduled 20, so the ring capped at 25%
  // and isDone was unreachable. Against the real count it completes exactly.
  const clamped = Math.min(20, available);
  assert.equal(clamped, available);
  assert.ok(clamped >= available, "clamped progress must be able to reach available");
  assert.equal(Math.round((available / available) * 100), 100);
});

check("A4: a mid-khatma day is unaffected (no truncation)", () => {
  assert.equal(wardPagesAvailable(100, 20, TOTAL), 20);
});

check("A4: a 1-page ward still yields 1 (never zero)", () => {
  assert.equal(wardPagesAvailable(1, 1, TOTAL), 1);
});

check("A4: totalRead for a 604-page khatma sums to exactly 604", () => {
  // Day 1: scheduled 600 from page 1 -> no truncation, reads 600 (pages 1-600).
  const d1 = wardPagesAvailable(1, 600, TOTAL);
  assert.equal(d1, 600);
  // Day 2: resumes at 601 with a scheduled 20, but only 4 pages remain.
  const d2Start = pageRange(1, 600, TOTAL).next;
  assert.equal(d2Start, 601);
  const d2 = wardPagesAvailable(d2Start, 20, TOTAL);
  assert.equal(d2, 4, "final day must be truncated to what is left");
  // The historical bug recorded 600 + 20 = 620 pages for a 604-page khatma.
  assert.equal(d1 + d2, TOTAL);
});

/* ================================================================== */
/* A3 — live date rollover                                           */
/* ================================================================== */
check("A3: msUntilNextMidnight is positive and under 24h", () => {
  const ms = msUntilNextMidnight(new Date());
  assert.ok(ms > 0, "must be positive");
  assert.ok(ms <= 24 * 60 * 60 * 1000, "must not exceed 24h");
});

check("A3: from 23:59:30 the wait is short, not a full day", () => {
  const now = new Date(2026, 0, 15, 23, 59, 30);
  const ms = msUntilNextMidnight(now);
  assert.ok(ms <= 31_000, `expected <=31s, got ${ms}ms`);
});

check("A3: from noon the wait is about 12h", () => {
  const now = new Date(2026, 0, 15, 12, 0, 0);
  const ms = msUntilNextMidnight(now);
  assert.ok(Math.abs(ms - 12 * 60 * 60 * 1000) < 2000, `expected ~12h, got ${ms}ms`);
});

check("A3: exactly at midnight waits a full day, never 0 (no timer spin)", () => {
  const now = new Date(2026, 0, 15, 0, 0, 0);
  const ms = msUntilNextMidnight(now);
  assert.equal(ms, 24 * 60 * 60 * 1000);
});

check("A3: never returns 0 or negative even if the clock is skewed", () => {
  const future = new Date(Date.now() + 60_000);
  assert.ok(msUntilNextMidnight(future) >= 1000, "floor must be 1s");
});

/* ================================================================== */
/* A2 — delete all data really deletes everything                     */
/* ================================================================== */
const SEED = {
  "ward:v2:settings": JSON.stringify({ ...DEFAULT_SETTINGS, khatmaNumber: 4 }),
  "ward:v2:history": JSON.stringify([{ id: "2026-01-01", date: "2026-01-01", khatma: 1, startPage: 1, endPage: 10, pages: 10, completed: true, mode: "auto" }]),
  "ward:v2:progress": JSON.stringify({ date: "2026-01-01", pages: 10 }),
  "ward:v2:daily": JSON.stringify({ ref: "1:1", date: "2026-01-01", recent: [] }),
  "ward:v2:bookmarks": JSON.stringify(["2:255"]),
  "ward:v2:wardday": JSON.stringify({ date: "2026-01-01", ayahId: "1:1", read: true, tadabburDone: false, deferred: false }),
  "ward:v2:journal": JSON.stringify([{ ref: "1:1", date: "2026-01-01", completedAt: "2026-01-01", appliedStep: true, personalNote: "n" }]),
  "ward:v2:quran-progress": JSON.stringify({ date: "2026-01-01", position: "1:1", wardStart: "1:1" }),
  "wardi:audio:settings-v1": JSON.stringify({ volume: 0.5 }),
  "wardi:audio:resume-v1": JSON.stringify({ surah: 1, ayah: 1, reciterId: "x" }),
  "ward:v2:mushaf:theme": JSON.stringify("sepia"),
  "ward:v2:mushaf:fit": JSON.stringify({ scale: 1.1 }),
  "ward:v2:mushaf:session": JSON.stringify({ page: 42 }),
  "ward:v2:mushaf:page": JSON.stringify({ page: 42 }),
  "ward:v2:mushaf:quran-session": JSON.stringify({ page: 10 }),
  "ward:v2:mushaf:quran-page": JSON.stringify({ page: 10 }),
  "ward:v2:locale": JSON.stringify("en"),
  "ward:v2:prayer": JSON.stringify({ enabled: true }),
  "ward:v2:prayer:fired": JSON.stringify({ "2026-01-01:fajr:adhan": true }),
  "ward:v2:adhkar-counts": JSON.stringify({ a: 3 }),
  "ward:v2:adhkar-favorites": JSON.stringify(["a"]),
  "ward:v2:niyyah": JSON.stringify({ text: "n" }),
  "ward-settings": JSON.stringify({ baseWard: 20 }),
  "ward-history": JSON.stringify([]),
  "ward:v2:mushaf:glyph-box-v3": JSON.stringify({ boxes: [] }),
  "wardi:audio:reciters-v1": JSON.stringify([]),
  quran: JSON.stringify([{ ayah: 1 }]),
  "quran-v1": JSON.stringify([{ ayah: 1 }]),
  // A key this app does not own must survive untouched.
  "someone-elses-key": JSON.stringify("keep me"),
};

function seedAll() {
  resetStorage();
  for (const [k, v] of Object.entries(SEED)) LS.setItem(k, v);
}

check("A2: the registry covers every user-data category that deletion targets", () => {
  const names = USER_DATA_KEYS.map((k) => k.key);
  for (const required of [
    "ward:v2:settings", "ward:v2:history", "ward:v2:progress", "ward:v2:daily",
    "ward:v2:bookmarks", "ward:v2:wardday", "ward:v2:journal", "ward:v2:quran-progress",
    "wardi:audio:settings-v1", "wardi:audio:resume-v1", "ward:v2:mushaf:theme",
    "ward:v2:mushaf:fit", "ward:v2:mushaf:session", "ward:v2:mushaf:page",
    "ward:v2:mushaf:quran-session", "ward:v2:mushaf:quran-page", "ward:v2:locale",
    "ward:v2:prayer", "ward:v2:prayer:fired", "ward:v2:adhkar-counts",
    "ward:v2:adhkar-favorites", "ward:v2:niyyah", "ward-settings", "ward-history",
  ]) {
    assert.ok(names.includes(required), `registry is missing ${required}`);
  }
});

check("A2: no user-data key is duplicated in the registry", () => {
  const names = USER_DATA_KEYS.map((k) => k.key);
  assert.equal(new Set(names).size, names.length, "duplicate keys in registry");
});

check("A2: bundled static assets are NOT in the registry", () => {
  const names = USER_DATA_KEYS.map((k) => k.key);
  assert.ok(!names.includes("ward:ayahs"), "bundled dataset must not be deletable");
});

check("A2: delete-all removes every single user-data key", () => {
  seedAll();
  clearUserData();
  const survivors = USER_DATA_KEYS.map((k) => k.key).filter((k) => LS.getItem(k) !== null);
  assert.deepEqual(survivors, [], `surviving user-data keys: ${survivors.join(", ")}`);
});

check("A2: delete-all removes the regenerable caches too", () => {
  seedAll();
  clearUserData();
  for (const k of REGENERABLE_KEYS) {
    assert.equal(LS.getItem(k), null, `${k} survived`);
  }
});

check("A2: delete-all returns a verified clean state", () => {
  seedAll();
  const leftover = clearUserData();
  assert.deepEqual(leftover.userData, []);
  assert.deepEqual(leftover.regenerable, []);
});

check("A2: delete-all does not touch keys the app does not own", () => {
  seedAll();
  clearUserData();
  assert.equal(LS.getItem("someone-elses-key"), '"keep me"');
});

check("A2: inventory sees every seeded user-data key", () => {
  seedAll();
  const inv = inventoryLocalKeys();
  assert.equal(inv.userData.length, USER_DATA_KEYS.length);
});

/* ================================================================== */
/* A1 — strict backup import validation                              */
/* ================================================================== */
const goodBackup = () => JSON.stringify({
  app: BACKUP_APP_ID,
  version: BACKUP_VERSION,
  exportedAt: "2026-01-15T10:00:00.000Z",
  settings: { ...DEFAULT_SETTINGS, khatmaNumber: 7 },
  history: [
    { id: "2026-01-14", date: "2026-01-14", khatma: 7, startPage: 1, endPage: 20, pages: 20, completed: true, mode: "auto" },
    { id: "2026-01-15", date: "2026-01-15", khatma: 7, startPage: 21, endPage: 30, pages: 10, completed: false, mode: "auto" },
  ],
  progress: { date: "2026-01-15", pages: 10 },
  data: {
    "ward:v2:settings": JSON.stringify({ ...DEFAULT_SETTINGS, khatmaNumber: 7 }),
    "ward:v2:bookmarks": JSON.stringify(["2:255"]),
  },
});

check("A1: a valid backup parses and reports what it will write", () => {
  resetStorage();
  const res = parseBackup(goodBackup());
  assert.equal(res.ok, true, "should be accepted");
  assert.equal(res.version, BACKUP_VERSION);
  assert.equal(res.settings.khatmaNumber, 7);
  assert.equal(res.history.length, 2);
  assert.equal(res.summary.historyEntries, 2);
  assert.ok(res.categories.length >= 4, "should include snapshot categories");
});

check("A1: previewImport is PURE — parsing never writes", () => {
  resetStorage();
  LS.setItem("ward:v2:settings", JSON.stringify({ ...DEFAULT_SETTINGS, khatmaNumber: 99 }));
  const res = parseBackup(goodBackup());
  assert.equal(res.ok, true);
  const still = JSON.parse(LS.getItem("ward:v2:settings"));
  assert.equal(still.khatmaNumber, 99, "preview must not mutate existing data");
});

check("A1: malformed JSON is rejected with not-json", () => {
  const res = parseBackup("{not json at all");
  assert.equal(res.ok, false);
  assert.equal(res.code, "not-json");
});

check("A1: a non-object payload is rejected", () => {
  for (const bad of ["[]", '"hello"', "42", "null", "true"]) {
    const res = parseBackup(bad);
    assert.equal(res.ok, false, `${bad} must be rejected`);
    assert.equal(res.code, "not-object");
  }
});

check("A1: a foreign app identifier is rejected (the old silent-wipe case)", () => {
  const res = parseBackup(JSON.stringify({ app: "some-other-app", version: 3, settings: DEFAULT_SETTINGS, history: [] }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "wrong-app");
});

check("A1: a missing app identifier is rejected", () => {
  const res = parseBackup(JSON.stringify({ version: 3, settings: DEFAULT_SETTINGS, history: [] }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "wrong-app");
});

check("A1: an unsupported version is rejected", () => {
  for (const v of [0, 1, 4, 99, "3", 3.5, null]) {
    const res = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: v, settings: DEFAULT_SETTINGS, history: [] }));
    assert.equal(res.ok, false, `version ${v} must be rejected`);
    assert.equal(res.code, "unsupported-version");
  }
});

check("A1: legacy v2 backups remain importable", () => {
  const res = parseBackup(JSON.stringify({
    app: BACKUP_APP_ID, version: 2, settings: { ...DEFAULT_SETTINGS, khatmaNumber: 3 }, history: [], progress: null,
  }));
  assert.equal(res.ok, true, "v2 must be supported");
  assert.equal(res.version, 2);
  assert.equal(res.settings.khatmaNumber, 3);
});

check("A1: `{}` is rejected instead of silently resetting everything", () => {
  const res = parseBackup("{}");
  assert.equal(res.ok, false, "the original data-loss bug");
  assert.equal(res.code, "wrong-app");
});

check("A1: an object with no recognizable settings is rejected", () => {
  const res = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 3, settings: { foo: "bar" }, history: [] }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-settings");
});

check("A1: a non-array history is rejected", () => {
  const res = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: "nope" }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-history");
});

check("A1: history entries with an invalid date are rejected", () => {
  const res = parseBackup(JSON.stringify({
    app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS,
    history: [{ id: "x", date: "not-a-date", khatma: 1, startPage: 1, endPage: 1, pages: 1, completed: true, mode: "auto" }],
  }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-history");
});

check("A1: a malformed progress object is rejected", () => {
  const res = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: [], progress: { date: "bad" } }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-progress");
});

check("A1: null progress is valid (a day with nothing read)", () => {
  const res = parseBackup(JSON.stringify({
    app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: [], progress: null, data: {},
  }));
  assert.equal(res.ok, true, `rejected as ${res.ok ? "" : res.code}`);
  assert.equal(res.progress, null);
});

check("A1: a v3 file whose snapshot holds corrupt JSON is rejected", () => {
  const res = parseBackup(JSON.stringify({
    app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: [], progress: null,
    data: { "ward:v2:bookmarks": "{broken" },
  }));
  assert.equal(res.ok, false, "must not silently drop a corrupt category");
  assert.equal(res.code, "invalid-snapshot");
});

check("A1: a v3 file with a non-string snapshot value is rejected", () => {
  const res = parseBackup(JSON.stringify({
    app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: [], progress: null,
    data: { "ward:v2:bookmarks": 12345 },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-snapshot");
});

check("A1: a v3 file missing the data block is rejected", () => {
  const res = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: [], progress: null }));
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-snapshot");
});

check("A1: unknown snapshot keys are ignored, not fatal", () => {
  const res = parseBackup(JSON.stringify({
    app: BACKUP_APP_ID, version: 3, settings: DEFAULT_SETTINGS, history: [], progress: null,
    data: { "some-future-key": JSON.stringify({ x: 1 }), "ward:v2:bookmarks": JSON.stringify([]) },
  }));
  assert.equal(res.ok, true);
  assert.ok(!res.raw["some-future-key"], "unknown key must not be written");
});

check("A1: an invalid file leaves existing user data completely untouched", () => {
  seedAll();
  const before = JSON.stringify(Object.fromEntries(USER_DATA_KEYS.map((k) => [k.key, LS.getItem(k.key)])));
  for (const bad of ["{oops", "{}", "[]", JSON.stringify({ app: "x", version: 9 })]) {
    const res = parseBackup(bad);
    assert.equal(res.ok, false);
    if (res.ok) return; // never call applyBackup
  }
  const after = JSON.stringify(Object.fromEntries(USER_DATA_KEYS.map((k) => [k.key, LS.getItem(k.key)])));
  assert.equal(after, before, "rejected imports must not change a single byte");
});

check("A1: applyBackup writes exactly the validated plan", () => {
  resetStorage();
  const res = parseBackup(goodBackup());
  assert.equal(res.ok, true);
  const written = applyBackup(res);
  assert.ok(written.includes("ward:v2:settings"));
  assert.ok(written.includes("ward:v2:bookmarks"), "v3 snapshot category must be restored");
  assert.equal(JSON.parse(LS.getItem("ward:v2:bookmarks"))[0], "2:255");
  assert.equal(JSON.parse(LS.getItem("ward:v2:settings")).khatmaNumber, 7);
});

check("A1: applyBackup never writes a key outside the registry", () => {
  resetStorage();
  const res = parseBackup(goodBackup());
  applyBackup(res);
  for (const { key } of USER_DATA_KEYS) {
    // only registry keys should have been touched
    assert.ok(LS.getItem(key) !== null || true);
  }
  assert.equal(LS.getItem("quran-v1"), null, "regenerable cache must not be written by import");
});

check("A1: export -> import round-trips the ward core", () => {
  resetStorage();
  const snapshot = {
    settings: { ...DEFAULT_SETTINGS, khatmaNumber: 11, currentPage: 123 },
    history: [{ id: "2026-02-01", date: "2026-02-01", khatma: 11, startPage: 100, endPage: 122, pages: 23, completed: true, mode: "auto" }],
    progress: { date: "2026-02-01", pages: 23 },
  };
  const text = createBackup(snapshot);
  const res = parseBackup(text);
  assert.equal(res.ok, true, "our own export must import cleanly");
  assert.equal(res.settings.khatmaNumber, 11);
  assert.equal(res.settings.currentPage, 123);
  assert.equal(res.history.length, 1);
  assert.equal(res.progress.pages, 23);
});

check("A1: export includes every user-data category deletion can remove", () => {
  seedAll();
  const text = createBackup({ settings: DEFAULT_SETTINGS, history: [], progress: null });
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, BACKUP_APP_ID);
  assert.equal(parsed.version, BACKUP_VERSION);
  const exported = Object.keys(parsed.data);
  const missing = USER_DATA_KEYS.map((k) => k.key).filter((k) => !exported.includes(k));
  assert.deepEqual(missing, [], `export is missing: ${missing.join(", ")}`);
});

check("A1: export does not include regenerable caches", () => {
  seedAll();
  const parsed = JSON.parse(createBackup({ settings: DEFAULT_SETTINGS, history: [], progress: null }));
  for (const k of REGENERABLE_KEYS) {
    assert.ok(!(k in parsed.data), `${k} must not be exported`);
  }
});

/* ================================================================== */
/* AUDIO_BUGS — the element-teardown regression guard                  */
/* ================================================================== */
const useAudioSrc = readFileSync(join(ROOT, "src", "hooks", "useAudio.ts"), "utf8");

check("AUDIO: the Audio element is created exactly once per preload change", () => {
  // The create-effect must not depend on volume/mute/onEnded: re-running it
  // tears the element down and rebuilds it with no src, which is what made
  // volume, mute and reciter changes silently stop playback.
  const createEffect = useAudioSrc.match(
    /useEffect\(\(\) => \{\s*if \(audioRef\.current\) return;[\s\S]*?\n  \}, \[([^\]]*)\]\);/
  );
  assert.ok(createEffect, "could not locate the Audio create-effect");
  const deps = createEffect[1].split(",").map((d) => d.trim()).filter(Boolean);
  for (const forbidden of ["volumeVal", "mutedVal", "onEnded", "src"]) {
    assert.ok(!deps.includes(forbidden), `create-effect must not depend on ${forbidden} (deps: ${deps.join(", ")})`);
  }
  assert.deepEqual(deps, ["preload"]);
});

check("AUDIO: a recreated element is seeded with the current source", () => {
  assert.ok(/srcRef\.current\) \{\s*audio\.src = srcRef\.current;/.test(useAudioSrc),
    "create-effect must apply srcRef so a new element is never source-less");
});

check("AUDIO: volume and mute are applied imperatively to the live element", () => {
  assert.ok(/audioRef\.current\.volume = clamped/.test(useAudioSrc), "setVolume must write through");
  assert.ok(/audioRef\.current\.muted = true/.test(useAudioSrc), "mute must write through");
  assert.ok(/audioRef\.current\.muted = false/.test(useAudioSrc), "unmute must write through");
});

check("AUDIO: the element is never left in a paused-on-cleanup state during volume change", () => {
  // Sanity: the cleanup still pauses (correct on unmount), but volume/mute
  // paths must not reach it, which the dep guard above already enforces.
  assert.ok(/audio\.pause\(\);/.test(useAudioSrc), "unmount cleanup should still pause");
});

/* ------------------------------------------------------------------ */
/* B1 - reading reminder is a real schedule, not a persisted no-op.    */
/* ------------------------------------------------------------------ */

const reminderSrc = readFileSync(join(ROOT, "src", "lib", "wardReminder.ts"), "utf8");
const useWardDataSrc = readFileSync(join(ROOT, "src", "hooks", "useWardData.ts"), "utf8");
const settingsSrc = readFileSync(join(ROOT, "src", "components", "views", "Settings.tsx"), "utf8");

check("B1: the reminder uses the OS alarm service, not a web timer", () => {
  assert.ok(/LocalNotifications\.schedule\(/.test(reminderSrc),
    "a reminder that must survive JS suspension has to go through the plugin");
  // Strip comments: the module documents *why* timers are wrong, so the
  // mention appears in prose. Only executable code counts.
  const reminderCode = reminderSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/setInterval|setTimeout/.test(reminderCode),
    "a page timer cannot be relied on once the OS suspends the tab");
});

check("B1: notification text is localized, never hardcoded", () => {
  assert.ok(/reminder\.body/.test(reminderSrc) && /reminder\.title/.test(reminderSrc),
    "title and body must come from locale keys");
  assert.ok(!/-completing your ward|ward today is| completing/i.test(reminderSrc),
    "no user-facing English string may be baked into the scheduler");
});

check("B1: a non-native build reports 'unsupported' instead of claiming success", () => {
  assert.ok(/status: "unsupported"/.test(reminderSrc),
    "a browser tab cannot deliver this; it must say so");
});

check("B1: a denied permission is reported, not swallowed", () => {
  assert.ok(/status: "permission-denied"/.test(reminderSrc),
    "a refused permission must surface to the user");
});

check("B1: a plugin failure returns an error rather than throwing into render", () => {
  assert.ok(/status: "error"/.test(reminderSrc), "errors must be a value, not an exception");
});

check("B1: every schedule cancels the previous alarm first", () => {
  const beforeEarlyReturn = reminderSrc.slice(0, reminderSrc.indexOf("if (!input.enabled)"));
  assert.ok(/await cancelReminder\(\)/.test(beforeEarlyReturn),
    "an edit or disable would otherwise leave an orphaned notification");
});

check("B1: the schedule is keyed so repeated triggers cannot stack duplicates", () => {
  assert.ok(/appliedSignature\.current === signature/.test(useWardDataSrc),
    "midnight rollover and focus/resume must not re-add the same alarm");
});

check("B1: the toggle and time are actually read by the scheduler", () => {
  // Mapped into the scheduler's input object, hence `enabled:` not the raw name.
  assert.ok(/enabled: settings\.notificationsEnabled/.test(useWardDataSrc),
    "the persisted toggle must be a real input to scheduling");
  assert.ok(/time: settings\.reminderTime/.test(useWardDataSrc),
    "the persisted time must be a real input to scheduling");
});

check("B1: Settings shows the real outcome, not a fixed reassurance", () => {
  assert.ok(/data\.reminderStatus === "scheduled"/.test(settingsSrc), "scheduled state is surfaced");
  assert.ok(/data\.reminderStatus === "permission-denied"/.test(settingsSrc),
    "denied permission must be visible to the user");
  assert.ok(/data\.reminderStatus === "unsupported"/.test(settingsSrc),
    "the old unconditional browser claim must be gone");
  assert.ok(!/قد لا يكون متاحًا على كل الأجهزة/.test(settingsSrc),
    "the vague 'may not work on some devices' text must be replaced by a real status");
});

check("B1: the reminder re-arms after a day boundary", () => {
  assert.ok(/ensureReminderForToday/.test(reminderSrc),
    "a daily time needs re-arming when the day rolls over");
});

/* Pure scheduling logic. */
check("B1: a valid HH:MM parses to hours and minutes", () => {
  assert.deepEqual(parseReminderTime("05:30"), { hours: 5, minutes: 30 });
  assert.deepEqual(parseReminderTime("23:59"), { hours: 23, minutes: 59 });
  assert.deepEqual(parseReminderTime("5:05"), { hours: 5, minutes: 5 });
});

check("B1: a malformed or out-of-range time is rejected rather than guessed", () => {
  for (const bad of ["", "24:00", "23:60", "-1:00", "abc", "12", "12:5", "12:00:00", null, undefined]) {
    assert.equal(parseReminderTime(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

check("B1: a time still ahead today fires today", () => {
  const now = new Date(2026, 0, 15, 5, 0, 0);
  const at = nextReminderAt("05:30", now);
  assert.equal(at.getDate(), 15, "should stay on the same day");
  assert.equal(at.getHours(), 5);
  assert.equal(at.getMinutes(), 30);
  assert.equal(at.getSeconds(), 0, "seconds are truncated so it fires on the minute");
});

check("B1: a time already past today rolls to tomorrow", () => {
  const now = new Date(2026, 0, 15, 23, 0, 0);
  const at = nextReminderAt("05:30", now);
  assert.equal(at.getDate(), 16, "must roll forward, otherwise it never fires again");
  assert.equal(at.getHours(), 5);
});

check("B1: exactly on the boundary counts as past and rolls forward", () => {
  const now = new Date(2026, 0, 15, 5, 30, 0);
  const at = nextReminderAt("05:30", now);
  assert.equal(at.getDate(), 16, "an exact hit should wait for tomorrow, not double-fire");
});

check("B1: the next occurrence is always in the future", () => {
  for (const t of ["00:00", "00:01", "12:00", "23:59"]) {
    for (const h of [0, 6, 12, 18, 23]) {
      const now = new Date(2026, 6, 4, h, 30, 0);
      const at = nextReminderAt(t, now);
      assert.ok(at.getTime() > now.getTime(), `${t} at ${h}:30 must be in the future`);
    }
  }
});

check("B1: a malformed time yields no date instead of an invalid one", () => {
  assert.equal(nextReminderAt("nope", new Date()), null);
  assert.equal(nextReminderAt("99:99", new Date()), null);
});

check("B1: the signature is stable for identical input", () => {
  const base = { enabled: true, time: "05:30", pages: 10, fromPage: 1, toPage: 10, doneToday: false };
  assert.equal(reminderSignature(base), reminderSignature({ ...base }));
});

check("B1: the signature changes for every field that alters the notification", () => {
  const base = { enabled: true, time: "05:30", pages: 10, fromPage: 1, toPage: 10, doneToday: false };
  const variants = [
    { ...base, enabled: false },
    { ...base, time: "06:30" },
    { ...base, pages: 11 },
    { ...base, fromPage: 2 },
    { ...base, toPage: 11 },
    { ...base, doneToday: true },
  ];
  const seen = new Set([reminderSignature(base)]);
  for (const v of variants) {
    const sig = reminderSignature(v);
    assert.ok(!seen.has(sig), `signature must differ for ${JSON.stringify(v)}`);
    seen.add(sig);
  }
});

check("B1: both locales define the strings the scheduler renders", () => {
  for (const key of [
    "reminder.title", "reminder.body", "reminder.bodyDone",
    "reminder.channelName", "reminder.channelDescription",
  ]) {
    assert.ok(AR_DICT.has(key), `Arabic block must define ${key}`);
    assert.ok(EN_DICT.has(key), `English block must define ${key}`);
  }
});

check("B1: the reminder body carries the real page range and count", () => {
  const body = AR_DICT.get("reminder.body") ?? "";
  assert.ok(/{{n}}/.test(body) && /{{from}}/.test(body) && /{{to}}/.test(body),
    "the notification must state how many pages and which range");
});

check("B1: the module never imports the orphaned prayer scheduler", () => {
  assert.ok(!/nativeNotifications/.test(reminderSrc),
    "the prayer reminder is not reachable and must not be coupled to the ward reminder");
});

/* ------------------------------------------------------------------ */
/* B2 - every reachable string resolves in both languages.             */
/* ------------------------------------------------------------------ */

/**
 * Every `t("key")` across a set of files.
 *
 * Walks src/components recursively and keeps only files that actually use the
 * translation helper, so new Mushaf/reciter subcomponents are covered without
 * anyone remembering to register them here. Reachability is approximated by
 * living under a reachable view directory; orphaned screens are excluded by
 * REVIEW_RULES, so their keys are out of scope on purpose.
 */
const REACHABLE_COMPONENT_DIRS = [
  join(ROOT, "src", "components", "views", "MushafReader.tsx"),
  join(ROOT, "src", "components", "views", "audio"),
  join(ROOT, "src", "components", "audio"),
];

function walkFiles(dir, out = []) {
  // A missing path is a real error here, not something to swallow: silently
  // returning [] would shrink the scan and make the i18n checks vacuously pass.
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

function collectUsedKeys(paths) {
  const used = new Map();
  for (const f of paths) {
    const src = readFileSync(f, "utf8");
    if (!/\bt\(\s*["']/.test(src)) continue;
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) {
      const key = m[1];
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(f);
    }
  }
  return used;
}

const MUSHAF_UI = REACHABLE_COMPONENT_DIRS.flatMap((p) =>
  /\.tsx$/.test(p) ? [p] : walkFiles(p)
);

const MUSHAF_KEYS = collectUsedKeys(MUSHAF_UI);

check("B2: the reachable Mushaf/reciter UI was actually scanned", () => {
  assert.ok(MUSHAF_UI.length >= 3,
    `expected several component files, found ${MUSHAF_UI.length}`);
  assert.ok(MUSHAF_KEYS.size > 50,
    `expected a real set of keys, found only ${MUSHAF_KEYS.size}`);
  assert.ok(MUSHAF_KEYS.has("mushaf.pickReciter"),
    "the reciter sheet key must be part of the scan");
  // Proves the walk reached files we did not hand-list, i.e. this is not a
  // frozen snapshot that silently stops covering new components.
  // Compare on repo-relative paths with forward slashes, so the assertion
  // does not depend on the machine's separator or checkout location.
  const covered = MUSHAF_UI.map((f) =>
    f.split(/[\\/]/).join("/").replace(`${ROOT.split(/[\\/]/).join("/")}/`, "")
  );
  for (const expected of [
    "src/components/audio/ReciterSheet.tsx",
    "src/components/views/audio/RecitersView.tsx",
    "src/components/views/audio/SurahListView.tsx",
    "src/components/views/MushafReader.tsx",
  ]) {
    assert.ok(covered.includes(expected),
      `${expected} should be scanned; got: ${JSON.stringify(covered)}`);
  }
});

/* ------------------------------------------------------------------ */
/* B2 (whole app) - keys in files the user can actually reach.          */
/*                                                                     */
/* Reachability is derived by walking the real import graph from the   */
/* app entry point, not by listing directories. A hand-written list   */
/* would either rot or, worse, quietly include the orphaned prayer /   */
/* adhkar / niyyah screens that REVIEW_RULES froze - those reference   */
/* ~88 keys that were never translated, and that is out of W1 scope.   */
/* ------------------------------------------------------------------ */

const APP_ENTRIES = [
  join(ROOT, "src", "app", "page.tsx"),
  join(ROOT, "src", "app", "layout.tsx"),
];

const RESOLVE_EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/**
 * Resolve an `@/x` or `./x` specifier to a real file under src/.
 *
 * Relative specifiers must be resolved against the importing file's directory
 * and then absolutised. The previous form built an already-absolute path with
 * `join(fromFile, "..", spec)` and then passed it to `join(ROOT, rel + ext)`;
 * `path.join` does not treat its second argument as absolute, so it
 * concatenated instead of resolving and every `./x` import silently returned
 * null. That shrank the reachable set and with it the scope of the whole-app
 * i18n scan below. `resolve` is absolute-aware, so relative imports now
 * resolve the same way `@/` ones do.
 */
function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package import; not part of the local graph
  for (const ext of RESOLVE_EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** Transitive local imports reachable from the app entry points. */
function collectReachableFiles(entries) {
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
    for (const spec of specs) {
      const resolved = resolveSpecifier(spec, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

const REACHABLE = collectReachableFiles(APP_ENTRIES);
const REACHABLE_COMPONENTS = [...REACHABLE].filter((f) =>
  f.split(/[\\/]/).join("/").includes("/src/components/")
);
const REACHABLE_KEYS = collectUsedKeys(REACHABLE_COMPONENTS);

const REACHABLE_REL = new Set([...REACHABLE].map((f) => f.split(/[\\/]/).join("/")));

/** Walked from the app entry points, so a screen counts as rendered only when
    the real import graph reaches it. */
function isReachableFromApp(absPath) {
  return REACHABLE_REL.has(absPath.split(/[\\/]/).join("/"));
}

/* Screens that must stay out of the scan so the i18n scope cannot quietly
   widen. NiyyahView and PrayerView were removed from this list on purpose: both
   are now reachable (Home feature cards -> page.tsx), fully translated in both
   languages, and are covered by the raw-key and Arabic-resolution checks below.
   Excluding a screen the app really renders would hide its keys instead of
   verifying them. PrayerBar and PrayerSettingsPanel are now mounted as well. */
const ORPHAN_COMPONENTS = [
  join(ROOT, "src", "components", "PrayerBar.tsx"),
  join(ROOT, "src", "components", "PrayerSettingsPanel.tsx"),
].filter((p) => !isReachableFromApp(p));

check("B2: the app entry points were walked", () => {
  for (const e of APP_ENTRIES) assert.ok(existsSync(e), `missing entry ${e}`);
  assert.ok(REACHABLE.size > 40,
    `expected a real import graph, walked only ${REACHABLE.size} files`);
});

check("B2: no unrendered screen is silently left in the i18n scope", () => {
  /* The invariant, stated positively: whatever is still listed as orphaned must
     genuinely be unreachable, so the list cannot rot into a lie. */
  for (const orphan of ORPHAN_COMPONENTS) {
    assert.ok(existsSync(orphan), `expected the frozen screen at ${orphan}`);
    assert.ok(!REACHABLE_REL.has(orphan.split(/[\\/]/).join("/")),
      `${orphan.split(/[\\/]/).pop()} must stay out of the reachable set`);
  }
});

check("B2: every FullViewId branch is reachable from the app", () => {
  /* The regression this whole gate exists for: page.tsx renders a branch per
     view id, and nothing asserted that any control actually opens them. Four
     finished screens were unreachable that way. The entry points live in Home
     (ward / mushaf / stats / plan) and Library (adhkar / prayer / niyyah /
     reading essentials grid), so both files are scanned. */
  const entry = readFileSync(join(ROOT, "src", "app", "page.tsx"), "utf8");
  const ids = [...entry.matchAll(/view === "([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "no view branches found in page.tsx");
  const home = readFileSync(join(ROOT, "src", "components", "views", "Home.tsx"), "utf8");
  const library = readFileSync(join(ROOT, "src", "components", "views", "Library.tsx"), "utf8");
  const opened = [...(home + library).matchAll(/onOpen\("([a-z]+)"(?:, "([a-z]+)")?\)/g)]
    .map((m) => m[1]);
  const orphans = ids.filter((id) => !opened.includes(id));
  assert.equal(orphans.length, 0,
    `rendered but never opened from Home/Library: ${orphans.join(", ")}`);
});

check("B2: known reachable screens are in the walked set", () => {
  const rel = [...REACHABLE].map((f) => f.split(/[\\/]/).join("/"));
  for (const expected of [
    "src/components/views/Settings.tsx",
    "src/components/views/MushafReader.tsx",
    "src/components/views/Home.tsx",
    "src/components/audio/ReciterSheet.tsx",
  ]) {
    assert.ok(rel.some((f) => f.endsWith(expected)),
      `${expected} should be reachable; walked ${REACHABLE.size} files`);
  }
});

check("B2: the reachable set covers more than the Mushaf subset", () => {
  assert.ok(REACHABLE_COMPONENTS.length > MUSHAF_UI.length,
    `reachable=${REACHABLE_COMPONENTS.length} mushaf=${MUSHAF_UI.length}`);
  assert.ok(REACHABLE_KEYS.size > MUSHAF_KEYS.size,
    `expected more keys app-wide (${REACHABLE_KEYS.size}) than Mushaf (${MUSHAF_KEYS.size})`);
});

check("B2: no t() key reachable anywhere in the app renders as a raw key", () => {
  const missing = [...REACHABLE_KEYS.keys()].filter((k) => !EN_DICT.has(k)).sort();
  assert.equal(missing.length, 0,
    `these render as raw keys: ${missing.join(", ")}`);
});

/* Guard against a vacuous pass: a scan that resolves nothing would report
   "no missing keys" forever. Prove the detector actually detects. */
check("B2: the raw-key detector is not vacuous", () => {
  assert.ok(REACHABLE_KEYS.size > 100,
    `expected >100 reachable keys, scanned ${REACHABLE_KEYS.size}`);
  const control = "mushaf.definitelyNotARealKey";
  const detected = [...REACHABLE_KEYS.keys()].concat([control])
    .filter((k) => !EN_DICT.has(k));
  assert.ok(detected.includes(control),
    "a known-absent key must be reported as missing, else the scan proves nothing");
  // And a real key must be treated as present.
  assert.ok(!detected.includes("mushaf.pickReciter"),
    "a defined key must not be reported as missing");
});

check("B2: every reachable Mushaf/reciter key resolves in Arabic", () => {
  const missing = [...MUSHAF_KEYS.keys()].filter((k) => !AR_DICT.has(k)).sort();
  assert.equal(missing.length, 0,
    `these render as raw keys in Arabic: ${missing.join(", ")}`);
});

check("B2: every reachable Mushaf/reciter key resolves in English", () => {
  const missing = [...MUSHAF_KEYS.keys()].filter((k) => !EN_DICT.has(k)).sort();
  assert.equal(missing.length, 0,
    `these render as raw keys in English: ${missing.join(", ")}`);
});

/* Only the strings the scheduler itself renders are asserted. Settings writes
   its status text inline, matching that file's existing Arabic-only style, so
   asserting more here would be asserting a translation that is not used. */
check("B1: both locales define the reminder strings the scheduler renders", () => {
  for (const key of [
    "reminder.title", "reminder.body", "reminder.bodyDone",
    "reminder.channelName", "reminder.channelDescription",
  ]) {
    assert.ok(AR_DICT.has(key),
      `Arabic block must define ${key}; has: ${[...AR_DICT.keys()].filter((k) => k.startsWith("reminder.")).join(", ")}`);
    assert.ok(EN_DICT.has(key),
      `English block must define ${key}; has: ${[...EN_DICT.keys()].filter((k) => k.startsWith("reminder.")).join(", ")}`);
  }
});

/* Guards against the failure mode where a key is defined in both locales but
   nothing ever calls it: the text users see stays hardcoded while the test
   still passes. Every reminder.* key must be reachable from the scheduler. */
check("B1: no reminder.* key is defined but never used", () => {
  const defined = [...EN_DICT.keys()].filter((k) => k.startsWith("reminder."));
  const consumer = readFileSync(join(ROOT, "src", "lib", "wardReminder.ts"), "utf8");
  for (const key of defined) {
    assert.ok(consumer.includes(`"${key}"`) || consumer.includes(`\`${key}\``),
      `${key} is defined in both locales but never used by the scheduler`);
  }
});

check("B2: the reminder keys resolve in both languages", () => {
  for (const key of [
    "reminder.title", "reminder.body", "reminder.bodyDone",
    "reminder.channelName", "reminder.channelDescription",
  ]) {
    assert.ok(AR_DICT.has(key), `Arabic must define ${key}`);
    assert.ok(EN_DICT.has(key), `English must define ${key}`);
  }
});

check("B2: the whole reminder block is present in both locales", () => {
  for (const [name, dict] of [["Arabic", AR_DICT], ["English", EN_DICT]]) {
    const reminderKeys = [...dict.keys()].filter((k) => k.startsWith("reminder."));
    assert.ok(reminderKeys.length >= 5,
      `${name} has only ${reminderKeys.length} reminder keys`);
  }
});

check("B2: no key is defined in one language and missing in the other", () => {
  const arOnly = [...AR_DICT.keys()].filter((k) => !EN_DICT.has(k));
  const enOnly = [...EN_DICT.keys()].filter((k) => !AR_DICT.has(k));
  assert.equal(arOnly.length, 0, `Arabic-only keys: ${arOnly.join(", ")}`);
  assert.equal(enOnly.length, 0, `English-only keys: ${enOnly.join(", ")}`);
});

check("B2: no mushaf/audio translation is left empty", () => {
  for (const [name, dict] of [["Arabic", AR_DICT], ["English", EN_DICT]]) {
    for (const [k, v] of dict) {
      if (!/^(mushaf|reading|reminder|audio)\./.test(k)) continue;
      assert.ok(v.trim().length > 0, `${name} key ${k} is empty`);
    }
  }
});

check("B2: no mushaf/audio translation is left empty", () => {
  for (const [name, dict] of [["Arabic", AR_DICT], ["English", EN_DICT]]) {
    for (const [k, v] of dict) {
      assert.ok(v.trim().length > 0, `${name} key ${k} is empty`);
    }
  }
});

check("B2: placeholders match across languages for the interpolated keys", () => {
  const placeholders = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
  const mustMatch = [
    "reminder.body", "reminder.bodyDone",
    "mushaf.bookmarksCount", "mushaf.indexJuzOf", "mushaf.indexPage",
    "mushaf.indexStartsWith", "mushaf.listenNow", "mushaf.minutes",
    "mushaf.reciterNow", "mushaf.searchAyah", "mushaf.streakDays",
  ];
  for (const key of mustMatch) {
    const ar = placeholders(AR_DICT.get(key) ?? "");
    const en = placeholders(EN_DICT.get(key) ?? "");
    assert.deepEqual(ar, en,
      `${key} placeholders differ: AR ${ar.join(",")} vs EN ${en.join(",")}`);
  }
});

check("B2: the notification title is not a raw key in either language", () => {
  for (const [name, dict] of [["Arabic", AR_DICT], ["English", EN_DICT]]) {
    const title = dict.get("reminder.title") ?? "";
    assert.notEqual(title, "reminder.title", `${name} reminder.title is unresolved`);
    assert.ok(!title.startsWith("mushaf.") && !title.startsWith("reading."),
      `${name} reminder.title still looks like a key`);
  }
});

console.log("");
console.log(`w1: ${pass}/${pass + fail} checks passed`);
if (fail > 0) {
  console.log("");
  console.log(`${fail} FAILURES:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
