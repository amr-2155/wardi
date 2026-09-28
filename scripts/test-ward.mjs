import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "ward-test");

const dataset = JSON.parse(readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8"));
const tafsir = JSON.parse(readFileSync(join(ROOT, "src", "data", "quran", "tafsir.json"), "utf8"));
const pool = tafsir.entries.map((e) => e.ref);

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  join(ROOT, "src", "lib", "dates.ts"),
  join(ROOT, "src", "lib", "quran", "types.ts"),
  join(ROOT, "src", "lib", "quran", "validate.ts"),
  join(ROOT, "src", "lib", "quran", "progress.ts"),
];

execFileSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "bin", "tsc"), ...libFiles, "--outDir", OUT, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node"],
  { cwd: ROOT, stdio: "pipe" }
);

const OUT_Q = join(OUT, "quran");

const {
  ayahsPerPage,
  ayahQuotaForPages,
  buildWardProgress,
  resizeTodayWard,
  advancePosition,
  advancePages,
  finishWard,
  pickTadabburCandidate,
  progressStats,
  globalIdOf,
  missedDayBacklog,
  remainingBacklog,
  compensationPlan,
  wardRollover,
} = await import(pathToFileURL(join(OUT_Q, "progress.js")).href);

const day = (iso) => iso;
const dateKey = (base, offset) => {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const CONFIG = { dailyPages: 25, totalPages: 604 };
const build = (prev, date, cfg = CONFIG) =>
  buildWardProgress({ prev, date, dailyPages: cfg.dailyPages, totalPages: cfg.totalPages, dataset, pool });
const advance = (state, ref) => advancePosition({ state, readUpTo: ref, dataset, pool });
const resize = (state, pages) =>
  resizeTodayWard({ state, dailyPages: pages, totalPages: CONFIG.totalPages, dataset, pool });

const invariants = (state, label) => {
  assert.ok(state, `${label}: state exists`);
  const startId = globalIdOf(dataset, state.wardStart);
  const posId = globalIdOf(dataset, state.position);
  const endId = globalIdOf(dataset, state.wardEnd);
  assert.ok(startId !== null && posId !== null && endId !== null, `${label}: refs resolve`);
  assert.ok(startId <= endId, `${label}: start <= end`);
  assert.equal(state.quotaAyahs, endId - startId + 1, `${label}: quota consistent`);
  const stats = progressStats(state, dataset);
  assert.ok(stats.read >= 0 && stats.remaining >= 0 && stats.quota >= 1, `${label}: no negatives`);
  assert.ok(stats.percent >= 0 && stats.percent <= 100, `${label}: percent in range`);
  if (stats.complete) {
    // completed ward: position is the next unread ayah, wrapping to 1:1 on khatma end
    const expectedNext = endId >= dataset.manifest.totalAyahs ? 1 : endId + 1;
    assert.equal(posId, expectedNext, `${label}: completed position = end+1 (or wrap)`);
  } else {
    assert.ok(posId >= startId, `${label}: position >= start (never rewinds)`);
    assert.ok(posId <= endId + 1, `${label}: position <= end+1`);
  }
  if (state.tadabburAyah) {
    const cid = globalIdOf(dataset, state.tadabburAyah);
    assert.ok(cid > posId, `${label}: candidate is unread (ahead of position)`);
    assert.ok(pool.includes(state.tadabburAyah), `${label}: candidate from curated pool`);
    if (cid <= endId) assert.equal(state.candidatePriority, "in-ward", `${label}: in-ward priority`);
    else assert.equal(state.candidatePriority, "next", `${label}: next priority`);
    const aheadFresh = pool.some((r) => {
      const id = globalIdOf(dataset, r);
      return id !== null && id > posId && !state.tadabburHistory.includes(r);
    });
    if (aheadFresh) {
      assert.ok(!state.tadabburHistory.includes(state.tadabburAyah), `${label}: candidate not recently used`);
    }
  }
  assert.equal(new Set(state.tadabburHistory).size, state.tadabburHistory.length, `${label}: history unique`);
};

// ---- Scenario 1: user starts a ward from Al-Fatiha then Al-Baqarah ----
check("S1: new ward starts at 1:1 and covers Fatiha + Baqarah precisely", () => {
  const state = build(null, day("2026-08-10"));
  assert.equal(state.wardStart, "1:1");
  assert.equal(state.position, "1:1");
  assert.equal(state.quotaAyahs, ayahQuotaForPages(dataset, 25, 604));
  assert.equal(state.quotaAyahs, 258);
  assert.equal(globalIdOf(dataset, state.wardEnd), 258);
  assert.equal(state.wardEnd, "2:251"); // crosses 1:7 -> 2:1 .. 2:251
});

// ---- Scenario 2: reopening the same day keeps the exact same state ----
check("S2: same-day rebuild returns the identical reference", () => {
  const state = build(null, day("2026-08-10"));
  assert.equal(build(state, day("2026-08-10")), state);
});

// ---- Scenario 3: the ward shows exactly the ayahs to be read ----
check("S3: ward range equals [start, start+quota-1] in global coords", () => {
  const state = build(null, day("2026-08-10"));
  const start = globalIdOf(dataset, state.wardStart);
  const end = globalIdOf(dataset, state.wardEnd);
  assert.equal(end - start + 1, state.quotaAyahs);
  assert.equal(progressStats(state, dataset).remaining, state.quotaAyahs);
});

// ---- Scenario 4: candidate is never an ayah the user already read ----
check("S4: candidate is always strictly ahead of position", () => {
  let state = build(null, day("2026-08-10"));
  for (let i = 0; i < 20; i += 1) {
    invariants(state, `S4 iter ${i}`);
    if (state.tadabburAyah) state = advance(state, state.tadabburAyah);
    else state = advance(state, state.wardEnd);
  }
});

// ---- Scenario 5: natural point — in-ward when possible, else next part ----
check("S5: 25-page ward picks an in-ward candidate (2:153)", () => {
  const state = build(null, day("2026-08-10"));
  assert.equal(state.tadabburAyah, "2:153");
  assert.equal(state.candidatePriority, "in-ward");
});
check("S5b: 1-page ward has no in-ward candidate -> next part (2:153, priority next)", () => {
  const small = build(null, day("2026-08-10"), { dailyPages: 1, totalPages: 604 });
  assert.equal(small.wardEnd, "2:3");
  assert.equal(small.tadabburAyah, "2:153");
  assert.equal(small.candidatePriority, "next");
});
check("S5c: pickTadabburCandidate skips recent history when possible", () => {
  const hit = pickTadabburCandidate(dataset, pool, "1:1", "2:251", ["2:153"]);
  assert.equal(hit.ref, "2:155");
});

// ---- Scenario 6: reading the candidate marks it read and auto-advances ----
check("S6: reading 2:153 advances position and selects 2:155", () => {
  const state = build(null, day("2026-08-10"));
  const next = advance(state, state.tadabburAyah);
  assert.equal(globalIdOf(dataset, next.position), globalIdOf(dataset, "2:154"));
  assert.deepEqual(next.tadabburHistory, ["2:153"]);
  assert.equal(next.tadabburAyah, "2:155");
});

// ---- Scenario 7: returning to the ward picks the NEXT unread ayah ----
check("S7: successive reads walk through 2:153 -> 2:155 -> 2:186", () => {
  let state = build(null, day("2026-08-10"));
  state = advance(state, state.tadabburAyah);
  state = advance(state, state.tadabburAyah);
  assert.equal(state.position, "2:156");
  assert.equal(state.tadabburAyah, "2:186");
  assert.deepEqual(state.tadabburHistory, ["2:155", "2:153"]);
});

// ---- Scenario 8: close & reopen preserves the reading position ----
check("S8: JSON round-trip + same-day rebuild preserves position", () => {
  let state = build(null, day("2026-08-10"));
  state = advance(state, state.tadabburAyah);
  const reloaded = JSON.parse(JSON.stringify(state));
  const rebuilt = build(reloaded, day("2026-08-10"));
  assert.equal(rebuilt.position, state.position);
  assert.equal(rebuilt.wardStart, state.wardStart);
  assert.equal(rebuilt.wardEnd, state.wardEnd);
  assert.deepEqual(rebuilt.tadabburHistory, state.tadabburHistory);
});

// ---- Scenario 9: day change creates the next ward correctly ----
check("S9: next day continues exactly from the reading position", () => {
  let state = build(null, day("2026-08-10"));
  state = advance(state, state.tadabburAyah); // position = 2:154 (global 161)
  const next = build(state, day("2026-08-11"));
  assert.equal(next.wardStart, "2:154");
  assert.equal(globalIdOf(dataset, next.wardEnd), 161 + 258 - 1);
  assert.equal(next.wardEnd, "3:125");
  assert.deepEqual(next.tadabburHistory, state.tadabburHistory);
});

// ---- Scenario 10: missed day backlog is computed precisely ----
check("S10: missed days sum the scheduled pages exactly", () => {
  const info = missedDayBacklog({
    completedDates: ["2026-08-10"],
    today: "2026-08-14",
    pagesFor: () => 25,
  });
  assert.deepEqual(info.missedDays, ["2026-08-11", "2026-08-12", "2026-08-13"]);
  assert.equal(info.missedPages, 75);
});
check("S10b: dynamic daily plan is honored per day", () => {
  const info = missedDayBacklog({
    completedDates: ["2026-08-10"],
    today: "2026-08-14",
    pagesFor: (d) => (d === "2026-08-12" ? 30 : 25),
  });
  assert.equal(info.missedPages, 80);
});

// ---- Scenario 11: compensation reduces the backlog immediately ----
check("S11: settling a missed day drops the backlog at once", () => {
  const before = missedDayBacklog({ completedDates: ["2026-08-10"], today: "2026-08-14", pagesFor: () => 25 });
  const afterSettle = missedDayBacklog({
    completedDates: ["2026-08-10", "2026-08-11"],
    today: "2026-08-14",
    pagesFor: () => 25,
  });
  assert.equal(before.missedPages, 75);
  assert.equal(afterSettle.missedPages, 50);
  assert.deepEqual(afterSettle.missedDays, ["2026-08-12", "2026-08-13"]);
});
check("S11b: remainingBacklog never goes negative", () => {
  assert.equal(remainingBacklog(75, 50), 25);
  assert.equal(remainingBacklog(75, 100), 0);
  assert.equal(remainingBacklog(0, 50), 0);
  assert.equal(remainingBacklog(75, 0), 75);
});

// ---- Scenario 12: no negative / contradictory numbers (property test) ----
check("S12: 60 simulated days never produce contradictions", () => {
  let state = null;
  for (let i = 0; i < 60; i += 1) {
    const d = dateKey("2026-08-10", i);
    state = build(state, d);
    invariants(state, `S12 day ${i}`);
    if (i % 2 === 0 && state.tadabburAyah) state = advance(state, state.tadabburAyah);
    invariants(state, `S12 day ${i} after read`);
    if (i % 3 === 2) state = finishWard({ state, dataset });
    invariants(state, `S12 day ${i} after finish`);
  }
});

// ---- Scenario 13: Fatiha -> Baqarah -> ward end transition ----
check("S13: crossing surah boundary and completing the ward", () => {
  const small = build(null, day("2026-08-10"), { dailyPages: 1, totalPages: 604 });
  assert.equal(small.wardStart, "1:1");
  assert.equal(small.wardEnd, "2:3");
  let state = advance(small, small.wardEnd); // read everything
  assert.equal(progressStats(state, dataset).complete, true);
  assert.equal(progressStats(state, dataset).remaining, 0);
  const done = finishWard({ state, dataset });
  assert.equal(done.position, "2:4"); // continues into Baqarah
  const tomorrow = build(done, day("2026-08-11"));
  assert.equal(tomorrow.wardStart, "2:4");
});

// ---- Scenario 14: tiny and huge wards ----
check("S14: 1-page ward is exactly 10 ayahs; 604-page ward is the whole Quran", () => {
  const tiny = build(null, day("2026-08-10"), { dailyPages: 1, totalPages: 604 });
  assert.equal(tiny.quotaAyahs, 10);
  assert.equal(tiny.wardEnd, "2:3");
  const huge = build(null, day("2026-08-10"), { dailyPages: 604, totalPages: 604 });
  assert.equal(huge.quotaAyahs, 6236);
  assert.equal(huge.wardEnd, "114:6");
  const done = finishWard({ state: huge, dataset });
  assert.equal(done.position, "1:1"); // wraps for the next khatma
});
check("S14b: a dailyPages of 0 is clamped to at least 1 ayah", () => {
  const clamped = build(null, day("2026-08-10"), { dailyPages: 0, totalPages: 604 });
  assert.ok(clamped.quotaAyahs >= 1);
});

// ---- Scenario 15: changing the ward mid-day affects calculations consistently ----
check("S15: shrinking the ward never dips below the read position", () => {
  let state = build(null, day("2026-08-10")); // end = 2:251 (global 258)
  state = advance(state, state.tadabburAyah); // position = 2:154 (global 161)
  const shrunk = resize(state, 10); // 10 pages -> global 10, clamped to last read = 160
  assert.equal(globalIdOf(dataset, shrunk.wardEnd), 160);
  assert.equal(shrunk.wardEnd, "2:153");
  assert.equal(progressStats(shrunk, dataset).remaining, 0);
  assert.equal(progressStats(shrunk, dataset).read, 160);
});
check("S15b: growing the ward back re-picks a valid in-ward candidate", () => {
  let state = build(null, day("2026-08-10"));
  state = advance(state, state.tadabburAyah);
  const grown = resize(state, 30);
  assert.equal(grown.wardEnd, "3:17");
  assert.equal(grown.tadabburAyah, "2:155");
  invariants(grown, "S15b");
});
check("S15c: same-day config change triggers resize automatically", () => {
  let state = build(null, day("2026-08-10"));
  state = advance(state, state.tadabburAyah); // position = 2:154 (global 161)
  const resized = build(state, day("2026-08-10"), { dailyPages: 10, totalPages: 604 });
  assert.equal(resized.wardEnd, "2:153"); // clamped: never below the read position
  assert.notEqual(resized, state);
});

// ---- Scenario 16: user who never started reading ----
check("S16: never-started user starts at 1:1 with a valid ahead candidate", () => {
  const state = build(null, day("2026-08-10"));
  assert.equal(state.position, "1:1");
  assert.equal(state.tadabburAyah, "2:153");
  assert.ok(globalIdOf(dataset, state.tadabburAyah) > globalIdOf(dataset, state.position));
});

// ---- Scenario 17: completed ward ----
check("S17: completed ward shows complete and advances to next day", () => {
  const state = build(null, day("2026-08-10"));
  const full = advance(state, state.wardEnd);
  const stats = progressStats(full, dataset);
  assert.equal(stats.complete, true);
  assert.equal(stats.remaining, 0);
  assert.equal(stats.percent, 100);
  const nextDay = build(finishWard({ state: full, dataset }), day("2026-08-11"));
  assert.equal(globalIdOf(dataset, nextDay.wardStart), 259);
});

// ---- Scenario 18: multiple missed days ----
check("S18: several missed days accumulate without going negative", () => {
  const info = missedDayBacklog({ completedDates: [], today: "2026-08-14", pagesFor: () => 25 });
  assert.ok(info.missedDays.length >= 13 && info.missedDays.length <= 366);
  assert.equal(info.missedPages, info.missedDays.length * 25);
  assert.ok(info.missedPages > 0);
});

// ---- Compensation plan (realistic, not punitive) ----
check("compensation plan: +5 pages/day until caught up", () => {
  assert.deepEqual(compensationPlan(75, 25), { addPerDay: 5, targetPages: 30, days: 15 });
  assert.equal(compensationPlan(0, 25), null);
  assert.deepEqual(compensationPlan(3, 25), { addPerDay: 1, targetPages: 26, days: 3 });
});

// ---- Conversion consistency ----
check("conversion: ayahsPerPage is the average, quota never exceeds the Quran", () => {
  assert.equal(ayahsPerPage(dataset, 604), 6236 / 604);
  assert.ok(ayahQuotaForPages(dataset, 10000, 604) <= 6236);
  assert.ok(ayahQuotaForPages(dataset, 25, 604) > 0);
});

// ---- Full flow: start -> read -> tadabbur -> complete across many days ----
check("full flow: start of reading until ward completion stays monotonic", () => {
  let state = null;
  let prevPos = 0;
  for (let i = 0; i < 14; i += 1) {
    const d = dateKey("2026-09-01", i);
    state = build(state, d);
    const posId = globalIdOf(dataset, state.position);
    assert.ok(posId >= prevPos || posId === 1, "position never goes backwards (except khatma wrap)");
    prevPos = posId;
    // open the ward, reflect on the candidate, read on
    while (state.tadabburAyah && progressStats(state, dataset).remaining > 0) {
      state = advance(state, state.tadabburAyah);
      invariants(state, `flow ${i}`);
    }
    // finish the day
    state = finishWard({ state, dataset });
    invariants(state, `flow ${i} done`);
  }
});

// ---- Page-based advance (reading experience) ----
check("page advance: moves exactly ~one page of ayahs and never overshoots the ward", () => {
  const state = build(null, day("2026-08-10"));
  const perPage = Math.floor(state.ayahsPerPage);
  const p1 = advancePages({ state, countAyahs: state.ayahsPerPage, dataset, pool });
  const p1id = globalIdOf(dataset, p1.position);
  const s1id = globalIdOf(dataset, state.position);
  assert.equal(p1id - s1id, perPage, "advanced one full page");
  assert.ok(p1id <= globalIdOf(dataset, p1.wardEnd) + 1, "never past ward end");
  invariants(p1, "page advance p1");
});
check("page advance: reading all pages completes the ward", () => {
  let state = build(null, day("2026-08-10"));
  let guard = 0;
  while (!progressStats(state, dataset).complete && guard < 40) {
    state = advancePages({ state, countAyahs: state.ayahsPerPage, dataset, pool });
    invariants(state, `page ${guard + 1}`);
    guard += 1;
  }
  assert.ok(progressStats(state, dataset).complete, "ward completes after its pages");
  assert.equal(progressStats(state, dataset).percent, 100);
});

// ---- ward rollover (unfinished pages carried to the next day) ----
const rollover = (opts) => wardRollover({ pagesFor: () => 25, readFor: () => 0, ...opts });
check("ward rollover: yesterday's remainder is owed today", () => {
  const info = rollover({
    completedDates: [],
    skippedDates: [],
    today: "2026-08-11",
    minDate: "2026-08-10",
    readFor: (d) => (d === "2026-08-10" ? 10 : 0),
  });
  assert.deepEqual(info.missedDays, ["2026-08-10"]);
  assert.equal(info.scheduledPages, 25);
  assert.equal(info.readPages, 10);
  assert.equal(info.remainingPages, 15);
});
check("ward rollover: minDate bounds the scan for first-time users", () => {
  const info = rollover({
    completedDates: [],
    skippedDates: [],
    today: "2026-08-11",
    minDate: "2026-08-10",
  });
  assert.deepEqual(info.missedDays, ["2026-08-10"]);
  assert.equal(info.scheduledPages, 25);
  assert.equal(info.readPages, 0);
  assert.equal(info.remainingPages, 25);
});
check("ward rollover: a completed day stops the streak", () => {
  const info = rollover({
    completedDates: ["2026-08-10"],
    skippedDates: [],
    today: "2026-08-11",
  });
  assert.deepEqual(info.missedDays, []);
  assert.equal(info.remainingPages, 0);
});
check("ward rollover: a skipped day is settled permanently", () => {
  const info = rollover({
    completedDates: [],
    skippedDates: ["2026-08-10"],
    today: "2026-08-11",
  });
  assert.deepEqual(info.missedDays, []);
  assert.equal(info.remainingPages, 0);
});
check("ward rollover: consecutive missed days stack their pages", () => {
  const info = rollover({
    completedDates: ["2026-08-08"],
    skippedDates: [],
    today: "2026-08-11",
    readFor: (d) => (d === "2026-08-09" ? 25 : 0),
  });
  assert.deepEqual(info.missedDays, ["2026-08-09", "2026-08-10"]);
  assert.equal(info.scheduledPages, 50);
  assert.equal(info.readPages, 25);
  assert.equal(info.remainingPages, 25);
});
check("ward rollover: no rollover when there is no missed day", () => {
  const info = rollover({
    completedDates: ["2026-08-10"],
    skippedDates: [],
    today: "2026-08-11",
  });
  assert.deepEqual(info.missedDays, []);
  assert.equal(info.remainingPages, 0);
});
check("ward rollover: read pages are never negative", () => {
  const info = rollover({
    completedDates: [],
    skippedDates: [],
    today: "2026-08-11",
    minDate: "2026-08-10",
    readFor: (d) => (d === "2026-08-10" ? 999 : 0),
  });
  assert.equal(info.remainingPages, 0);
});

// ---- runner ----
for (const { name, fn } of checks) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
console.log(`\n${passed}/${checks.length} checks passed`);
