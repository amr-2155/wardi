/**
 * P0 — Daily Wird page-range, completion and carryover-registration harness.
 *
 * This is a regression proof for the master prompt's highest-priority bug:
 * a configured range such as pages 1..25 must NOT report "Wird completed"
 * while the reader is still on page 1. The old model inferred progress from
 * the page the reader happened to be on; the current model derives it only
 * from the set of pages explicitly confirmed as finished.
 *
 * Everything below imports the REAL compiled production modules (the same
 * ones the app ships) and drives them through a small reader-state sim that
 * mirrors how MushafReader + useWardData actually interact: page turns call
 * recordWardPage(), the ward progress mirror is set to the confirmed count,
 * and `completeToday()` fires once on the false->true completion edge.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "ward-p0-test");

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  join(ROOT, "src", "lib", "dates.ts"),
  join(ROOT, "src", "lib", "types.ts"),
  join(ROOT, "src", "lib", "ward.ts"),
  join(ROOT, "src", "lib", "quran", "mushafSession.ts"),
];
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    ...libFiles,
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

const {
  defaultSession,
  recordWardPage,
  recordedPagesOf,
  wardReachedCount,
  wardIsComplete,
  wardBounds,
  saveSession,
  loadSession,
  clearSession,
  MUSHAF_SESSION_KEY,
} = await import(pathToFileURL(join(OUT, "quran", "mushafSession.js")).href);
const { pageRange, wardPagesAvailable, canCompleteToday, tomorrowStartPage } = await import(
  pathToFileURL(join(OUT, "ward.js")).href
);

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/* A faithful, minimal model of the reader <-> ward-data contract. */
function makeReader({ start = 1, end = 25, total = 604, seed = {} } = {}) {
  return {
    session: defaultSession({
      startPage: start,
      endPage: end,
      totalPages: total,
      ...seed,
    }),
    progressPages: 0,
    completionEvents: 0,
    dayCompleted: false,
    total,
    start,
    end,
  };
}
function stateOf(reader) {
  const b = wardBounds(reader.session);
  return {
    total: b.total,
    reached: wardReachedCount(reader.session),
    remaining: Math.max(0, b.total - wardReachedCount(reader.session)),
    complete: wardIsComplete(reader.session),
    nextPage: Math.min(reader.total, b.start + wardReachedCount(reader.session)),
    percent: b.total ? Math.round((wardReachedCount(reader.session) / b.total) * 100) : 0,
  };
}
/* Leaving `page` forward confirms it, exactly like the reader's page-turn
   effect. Landing on or re-opening a page never calls this. */
function leavePage(reader, page) {
  const before = reader.session;
  const res = recordWardPage(before, page);
  if (res.added === 0) return { added: 0, completionEvents: 0 };
  const wasComplete = wardIsComplete(before);
  reader.session = {
    ...before,
    recordedPages: res.recordedPages,
    completedPages: res.reached,
    completed: res.complete,
    ...(res.complete ? { sessionEndTime: new Date().toISOString() } : {}),
  };
  reader.progressPages = res.reached;
  let events = 0;
  if (res.complete && !wasComplete && !reader.dayCompleted) {
    // Mirrors recordPage(): data.completeToday() is guarded by the app-level
    // day entry, so even a repeated finish cannot create a second event.
    reader.dayCompleted = true;
    events = 1;
    reader.completionEvents += 1;
  }
  return { added: res.added, reached: res.reached, complete: res.complete, completionEvents: events };
}

/* ---- 1. Range sizing and honest opening state ---- */
check("P0-1: pages 1..25 is exactly 25 pages, opens 0/25, not complete", () => {
  const r = makeReader({ start: 1, end: 25 });
  const s = stateOf(r);
  assert.equal(s.total, 25);
  assert.equal(s.reached, 0);
  assert.equal(s.remaining, 25);
  assert.equal(s.complete, false);
  assert.equal(s.nextPage, 1);
  assert.equal(s.percent, 0);
});

check("P0-2: merely opening / re-rendering page 1 never completes the ward", () => {
  const r = makeReader({ start: 1, end: 25 });
  // Simulate many renders and a re-open with no page confirmation at all.
  for (let i = 0; i < 10; i += 1) {
    assert.equal(wardIsComplete(r.session), false);
    assert.equal(stateOf(r).reached, 0);
  }
  assert.equal(r.completionEvents, 0);
});

/* ---- 2. Progressive, accurate progress ---- */
check("P0-3: confirming page 1 moves 0/25 to 1/25 without completing", () => {
  const r = makeReader({ start: 1, end: 25 });
  const out = leavePage(r, 1);
  assert.equal(out.added, 1);
  assert.equal(out.complete, false);
  assert.equal(out.completionEvents, 0);
  assert.equal(stateOf(r).reached, 1);
  assert.equal(stateOf(r).remaining, 24);
});

check("P0-4: 20 confirmed pages leave exactly 5 remaining", () => {
  const r = makeReader({ start: 1, end: 25 });
  for (let p = 1; p <= 20; p += 1) leavePage(r, p);
  const s = stateOf(r);
  assert.equal(s.reached, 20);
  assert.equal(s.remaining, 5);
  assert.equal(s.complete, false);
  assert.equal(s.nextPage, 21);
  assert.equal(r.progressPages, 20);
  assert.equal(r.completionEvents, 0);
});

check("P0-5: confirming the final pages completes exactly once at page 25", () => {
  const r = makeReader({ start: 1, end: 25 });
  for (let p = 1; p <= 20; p += 1) leavePage(r, p);
  assert.equal(wardIsComplete(r.session), false);
  for (let p = 21; p <= 24; p += 1) {
    const out = leavePage(r, p);
    assert.equal(out.completionEvents, 0);
    assert.equal(out.complete, false);
  }
  const last = leavePage(r, 25);
  assert.equal(last.complete, true);
  assert.equal(last.completionEvents, 1);
  assert.equal(stateOf(r).complete, true);
  assert.equal(stateOf(r).remaining, 0);
  assert.equal(stateOf(r).percent, 100);
  assert.equal(r.completionEvents, 1);
});

/* ---- 3. Duplicate prevention ---- */
check("P0-6: re-confirming pages never double-counts or re-celebrates", () => {
  const r = makeReader({ start: 1, end: 25 });
  for (let p = 1; p <= 25; p += 1) leavePage(r, p);
  assert.equal(r.completionEvents, 1);
  for (const p of [1, 5, 20, 25, 25, 1]) {
    const out = leavePage(r, p);
    assert.equal(out.added, 0);
    assert.equal(out.completionEvents, 0);
  }
  assert.equal(stateOf(r).reached, 25);
  assert.equal(r.completionEvents, 1);
});

check("P0-7: walking back and forth counts each page only once", () => {
  const r = makeReader({ start: 1, end: 25 });
  for (const p of [1, 2, 3, 2, 1, 2, 3, 4, 5]) leavePage(r, p);
  assert.deepEqual(recordedPagesOf(r.session), [1, 2, 3, 4, 5]);
  assert.equal(stateOf(r).reached, 5);
});

/* ---- 4. Persistence across restarts ---- */
check("P0-8: progress and completion survive a close/reopen with no new event", () => {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    const r = makeReader({ start: 1, end: 25 });
    for (let p = 1; p <= 20; p += 1) leavePage(r, p);
    saveSession(r.session);

    const reloaded = makeReader({ start: 1, end: 25, seed: loadSession() });
    assert.equal(stateOf(reloaded).reached, 20, "partial progress persisted");
    assert.equal(stateOf(reloaded).complete, false);
    for (let p = 21; p <= 25; p += 1) leavePage(reloaded, p);
    assert.equal(reloaded.completionEvents, 1, "completion happens once after reopen");
    saveSession(reloaded.session);

    const openedAgain = makeReader({ start: 1, end: 25, seed: loadSession() });
    assert.equal(stateOf(openedAgain).complete, true);
    assert.equal(openedAgain.completionEvents, 0, "reopening a completed ward fires no event");
    for (const p of [1, 25]) assert.equal(leavePage(openedAgain, p).completionEvents, 0);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

check("P0-9: a stale completed flag cannot complete an empty recorded set", () => {
  const r = makeReader({
    start: 1,
    end: 25,
    seed: { completed: true, completedPages: 25, recordedPages: [] },
  });
  assert.equal(r.session.completed, false, "defaultSession derives from recordedPages");
  assert.equal(wardIsComplete(r.session), false);
  assert.equal(stateOf(r).reached, 0);
});

check("P0-10: a short recorded set with a completed flag stays partial", () => {
  const r = makeReader({
    start: 1,
    end: 25,
    seed: { completed: true, completedPages: 25, recordedPages: [1, 2, 3] },
  });
  assert.equal(wardIsComplete(r.session), false);
  assert.equal(stateOf(r).reached, 3);
  assert.equal(stateOf(r).remaining, 22);
});

/* ---- 5. Validation, surah boundaries and final-day clamping ---- */
check("P0-11: range is clamped and validated against the real page count", () => {
  assert.deepEqual(pageRange(1, 25, 604), { start: 1, end: 25, next: 26 });
  assert.deepEqual(pageRange(600, 25, 604), { start: 600, end: 604, next: 1 });
  // Out-of-range/negative starts fall back to page 1.
  assert.deepEqual(pageRange(-5, 25, 604), { start: 1, end: 25, next: 26 });
  // A range that crosses the Fatiha -> Baqarah boundary still counts pages.
  const crossing = makeReader({ start: 1, end: 4 });
  for (let p = 1; p <= 4; p += 1) leavePage(crossing, p);
  assert.equal(stateOf(crossing).reached, 4, "surah crossing counted by page");
  assert.equal(stateOf(crossing).complete, true);
});

check("P0-12: out-of-range pages are ignored (no false completion/minus)", () => {
  const r = makeReader({ start: 10, end: 12 });
  for (const p of [9, 13, 0, -1, 604]) {
    assert.equal(leavePage(r, p).added, 0);
  }
  assert.equal(stateOf(r).reached, 0);
  assert.equal(wardIsComplete(r.session), false);
  leavePage(r, 10);
  assert.deepEqual(recordedPagesOf(r.session), [10]);
});

check("P0-13: final khatma day clamps the denominator so completion is reachable", () => {
  // 20 pages scheduled but only 4 pages remain (601..604): denominator must be 4.
  assert.equal(wardPagesAvailable(601, 20, 604), 4);
  const r = makeReader({ start: 601, end: 604 });
  for (let p = 601; p <= 604; p += 1) leavePage(r, p);
  assert.equal(stateOf(r).complete, true);
  assert.equal(r.completionEvents, 1);
});

check("P0-14: completion of a one-page ward still needs that page confirmed", () => {
  const r = makeReader({ start: 7, end: 7 });
  assert.equal(stateOf(r).complete, false);
  assert.equal(leavePage(r, 7).completionEvents, 1);
  assert.equal(stateOf(r).complete, true);
});

/* ---- 6. The logic-level completion guard (root cause of the false finish) ---- */
check("P0-16: completeToday guard requires the pages to actually be recorded", () => {
  assert.equal(canCompleteToday(0, 25), false, "0/25 cannot finish");
  assert.equal(canCompleteToday(20, 25), false, "20/25 cannot finish");
  assert.equal(canCompleteToday(24, 25), false, "24/25 cannot finish");
  assert.equal(canCompleteToday(25, 25), true, "25/25 can finish");
  assert.equal(canCompleteToday(26, 25), true, "over-count is still a genuine finish");
  assert.equal(canCompleteToday(4, 4), true);
  assert.equal(canCompleteToday(3, 4), false);
  assert.equal(canCompleteToday(NaN, 25), false, "invalid progress never finishes");
  assert.equal(canCompleteToday(25, 0), true, "a zero-size ward clamps to one required page");
});

check("P0-17: re-applying a ward clears a stale completed reader session", () => {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    const stale = makeReader({ start: 1, end: 25 });
    for (let p = 1; p <= 25; p += 1) leavePage(stale, p);
    assert.equal(wardIsComplete(stale.session), true);
    saveSession(stale.session);
    assert.ok(store.has(MUSHAF_SESSION_KEY), "stale completed session was persisted");
    // setTodayWard() calls clearSession() before writing the new reservation.
    clearSession();
    assert.equal(loadSession(), null, "stale session is gone");
    const fresh = makeReader({ start: 1, end: 25 });
    assert.equal(stateOf(fresh).complete, false, "new ward cannot inherit completion");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

check("P0-18: the hook really wires the guard and the stale-session clear", () => {
  const src = readFileSync(join(ROOT, "src", "hooks", "useWardData.ts"), "utf8");
  assert.match(src, /canCompleteToday\(progressRef\.current, todayPages\)/);
  assert.match(src, /clearSession\(\);/);
});

check("P0-19: a repeated finish press cannot re-complete or replay the celebration", () => {
  // recordWardPage is idempotent: once every page is recorded it keeps reporting
  // complete=true even when added=0. Both reader completion paths must therefore
  // fire only on the false->true edge, or a repeat press would re-count/re-celebrate.
  const full = Array.from({ length: 25 }, (_, i) => i + 1);
  const done = { startPage: 1, endPage: 25, recordedPages: full, completed: true };
  const repeat = recordWardPage(done, 25);
  assert.equal(repeat.added, 0, "an already-read page adds nothing");
  assert.equal(repeat.complete, true, "but the set still reports complete");

  const reader = readFileSync(join(ROOT, "src", "components", "views", "MushafReader.tsx"), "utf8");
  const edges = reader.match(/if \(res\.complete && !wasComplete\)/g) ?? [];
  assert.ok(edges.length >= 2, "both completion paths must guard the false->true edge");
});

check("P0-20: a settled day does not skip a ward in the tomorrow preview", () => {
  /* Found in the 412x915 visual pass: after completing a 1-page ward on page 1,
     the 100% screen announced "tomorrow: page 3". completeToday had already
     advanced currentPage to 2, so range.next of the ADVANCED range was 3. */
  const settled = tomorrowStartPage({
    completedToday: true, isDone: true,
    advancedStart: 2, nextAfterToday: 3, resumeStart: 2, totalPages: 604,
  });
  assert.equal(settled, 2, "a completed 1-page ward resumes at page 2, not 3");

  const regular = tomorrowStartPage({
    completedToday: true, isDone: true,
    advancedStart: 26, nextAfterToday: 51, resumeStart: 26, totalPages: 604,
  });
  assert.equal(regular, 26, "a completed 1..25 ward resumes at 26, not 51");

  const manual = tomorrowStartPage({
    completedToday: false, isDone: true,
    advancedStart: 1, nextAfterToday: 26, resumeStart: 1, totalPages: 604,
  });
  assert.equal(manual, 26, "manual progress without settling still resumes after today's block");

  const partial = tomorrowStartPage({
    completedToday: false, isDone: false,
    advancedStart: 1, nextAfterToday: 26, resumeStart: 10, totalPages: 604,
  });
  assert.equal(partial, 10, "an unfinished ward carries over from the last page read");

  const src = readFileSync(join(ROOT, "src", "hooks", "useWardData.ts"), "utf8");
  assert.match(src, /completedToday: !!todayReading\?\.completed/);
  assert.match(src, /advancedStart: range\.start/);
});

check("P0-15: the production module sources were really compiled and read", () => {
  assert.ok(existsSync(join(ROOT, "src", "lib", "quran", "mushafSession.ts")));
  const src = readFileSync(join(ROOT, "src", "lib", "quran", "mushafSession.ts"), "utf8");
  assert.match(src, /export function recordWardPage/);
  assert.match(src, /completion is derived from that set and nothing else/i);
});

for (const { name, fn } of checks) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
console.log(`\nP0 ward correctness: ${passed}/${checks.length} checks passed`);
