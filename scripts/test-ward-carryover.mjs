/**
 * P1 — Unfinished-ward carryover harness.
 *
 * Proves the three explicit choices against the REAL compiled production
 * modules. The scenarios are the ones from the master prompt:
 *   - a 25-page ward read to 20 leaves exactly 5 pages owed,
 *   - next day: continue / add / postpone each behave differently,
 *   - "add" makes 25 + 5 = 30 without double-counting,
 *   - multiple unfinished days keep their ORIGINAL dates,
 *   - postpone is persisted, not discarded,
 *   - the same decision can never add the same pages twice,
 *   - sanitizeReading preserves the decision fields on a backup round-trip.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "ward-carryover-test");

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  join(ROOT, "src", "lib", "dates.ts"),
  join(ROOT, "src", "lib", "types.ts"),
  join(ROOT, "src", "lib", "quran", "types.ts"),
  join(ROOT, "src", "lib", "userData.ts"),
  join(ROOT, "src", "lib", "carryover.ts"),
  join(ROOT, "src", "lib", "storage.ts"),
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
  carryoverState,
  applyCarryoverDecision,
  unfinishedWards,
  plannedPagesOf,
  remainingOf,
} = await import(pathToFileURL(join(OUT, "carryover.js")).href);
const { sanitizeReading } = await import(pathToFileURL(join(OUT, "storage.js")).href);

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const reading = (over = {}) => ({
  id: "r",
  date: "2026-11-17",
  khatma: 1,
  startPage: 1,
  endPage: 25,
  plannedStart: 1,
  plannedEnd: 25,
  pages: 20,
  completed: false,
  mode: "manual",
  ...over,
});

/* ---- 1. Debt detection from a partially read ward ---- */
check("P1-1: a 25-page ward read to 20 leaves exactly 5 pages owed", () => {
  const r = reading();
  assert.equal(plannedPagesOf(r), 25);
  assert.equal(remainingOf(r), 5);
  const list = unfinishedWards([r], "2026-11-18", 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].remaining, 5);
  assert.equal(list[0].pagesRead, 20);
  assert.equal(list[0].plannedPages, 25);
});

check("P1-2: a completed day and a fully-read day owe nothing", () => {
  assert.equal(remainingOf(reading({ completed: true })), 0);
  assert.equal(remainingOf(reading({ pages: 25 })), 0);
  assert.equal(unfinishedWards([reading({ completed: true }), reading({ pages: 25 })], "2026-11-18", 1).length, 0);
});

check("P1-3: today's own unfinished ward is not offered as carryover", () => {
  const list = unfinishedWards([reading()], "2026-11-17", 1);
  assert.equal(list.length, 0, "same-day debt is current progress, not carryover");
});

/* ---- 2. CHOICE B — add remainder to today (25 + 5 = 30) ---- */
check("P1-4: 'add' produces a 25 + 5 = 30 target exactly once", () => {
  const history = [reading()];
  const first = applyCarryoverDecision({ history, today: "2026-11-18", khatma: 1, choice: "add", baseTarget: 25 });
  assert.equal(first.changed, true);
  assert.equal(first.addedPages, 5);
  assert.equal(first.adjustedTarget, 30);
  assert.equal(first.history[0].carryoverDecision, "add");
  assert.equal(first.history[0].carryoverDecisionDate, "2026-11-18");
  assert.equal(first.history[0].carryoverAdjustedTarget, 30);
});

check("P1-5: repeating 'add' cannot add the same 5 pages twice", () => {
  let history = [reading()];
  const a = applyCarryoverDecision({ history, today: "2026-11-18", khatma: 1, choice: "add", baseTarget: 25 });
  history = a.history;
  const b = applyCarryoverDecision({ history, today: "2026-11-19", khatma: 1, choice: "add", baseTarget: 25 });
  assert.equal(b.changed, false, "already-decided debt is not re-added");
  assert.equal(b.addedPages, 0);
  assert.equal(b.adjustedTarget, 25, "no phantom +5 on the repeat");
  assert.equal(history.length, 1, "no duplicate record created");
});

/* ---- 3. CHOICE A — continue one ward at a time ---- */
check("P1-6: 'continue' targets only the oldest ward (one at a time)", () => {
  const history = [
    reading({ id: "old", date: "2026-11-16", pages: 10 }), // 15 owed
    reading({ id: "new", date: "2026-11-17", pages: 20 }), // 5 owed
  ];
  const state = carryoverState(history, "2026-11-18", 1);
  assert.equal(state.all.length, 2);
  assert.equal(state.oldestDate, "2026-11-16");
  const res = applyCarryoverDecision({
    history,
    today: "2026-11-18",
    khatma: 1,
    choice: "continue",
    baseTarget: 25,
    onlyId: state.all[0].id,
  });
  assert.equal(res.changed, true);
  assert.equal(res.addedPages, 0, "continue never changes the target");
  assert.equal(res.history.find((r) => r.id === "old").carryoverDecision, "continue");
  assert.equal(res.history.find((r) => r.id === "new").carryoverDecision, undefined, "other day still pending");
});

/* ---- 4. CHOICE C — postpone persisted with original dates ---- */
check("P1-7: 'postpone' keeps the debt, decision and original date", () => {
  const history = [reading()];
  const res = applyCarryoverDecision({ history, today: "2026-11-18", khatma: 1, choice: "postpone", baseTarget: 25 });
  assert.equal(res.changed, true);
  assert.equal(res.addedPages, 0);
  assert.equal(res.adjustedTarget, 25, "postpone never changes the target");
  const after = carryoverState(res.history, "2026-11-18", 1);
  assert.equal(after.postponed.length, 1);
  assert.equal(after.postponed[0].date, "2026-11-17", "original date preserved");
  assert.equal(after.postponed[0].remaining, 5, "owed pages preserved, not erased");
  assert.equal(after.pendingRemaining, 0);
});

check("P1-8: a postponed ward can still be upgraded to 'add' later", () => {
  let history = [reading()];
  history = applyCarryoverDecision({ history, today: "2026-11-18", khatma: 1, choice: "postpone", baseTarget: 25 }).history;
  const upgrade = applyCarryoverDecision({ history, today: "2026-11-19", khatma: 1, choice: "add", baseTarget: 25 });
  assert.equal(upgrade.changed, true);
  assert.equal(upgrade.addedPages, 5, "the 5 pages are added exactly once, on upgrade");
  assert.equal(upgrade.history[0].carryoverDecision, "add");
});

/* ---- 5. Multiple days summed correctly for 'add' ---- */
check("P1-9: multiple days sum their remainders with dates intact", () => {
  const history = [
    reading({ id: "d1", date: "2026-11-15", pages: 20 }), // 5
    reading({ id: "d2", date: "2026-11-16", pages: 22 }), // 3
    reading({ id: "d3", date: "2026-11-17", pages: 24 }), // 1
  ];
  const res = applyCarryoverDecision({ history, today: "2026-11-18", khatma: 1, choice: "add", baseTarget: 25 });
  assert.equal(res.addedPages, 9, "5 + 3 + 1 = 9");
  assert.equal(res.adjustedTarget, 34, "25 + 9 = 34");
  assert.deepEqual(res.history.map((r) => r.date), ["2026-11-15", "2026-11-16", "2026-11-17"]);
  assert.equal(new Set(res.history.map((r) => r.id)).size, 3, "no merge, no duplicate");
});

check("P1-10: carryover is scoped to the current khatma only", () => {
  const history = [
    reading({ id: "oldK", date: "2026-11-15", khatma: 1, pages: 20 }),
    reading({ id: "thisK", date: "2026-11-17", khatma: 2, pages: 20 }),
  ];
  const state = carryoverState(history, "2026-11-18", 2);
  assert.equal(state.all.length, 1);
  assert.equal(state.all[0].id, "thisK", "an older khatma's debt is not charged to the new plan");
});

/* ---- 6. Storage round-trip preserves the decision (no new key) ---- */
check("P1-11: sanitizeReading preserves every carryover field", () => {
  const clean = sanitizeReading({
    ...reading(),
    carryoverDecision: "add",
    carryoverDecisionDate: "2026-11-18",
    carryoverAdjustedTarget: 30,
  });
  assert.equal(clean.carryoverDecision, "add");
  assert.equal(clean.carryoverDecisionDate, "2026-11-18");
  assert.equal(clean.carryoverAdjustedTarget, 30);
});

check("P1-12: sanitizeReading rejects an unknown decision but keeps old records", () => {
  const bad = sanitizeReading({ ...reading(), carryoverDecision: "delete-everything" });
  assert.equal(bad.carryoverDecision, undefined, "unknown choice is dropped");
  const legacy = sanitizeReading({ ...reading(), carryoverDecision: undefined });
  assert.equal(legacy.carryoverDecision, undefined, "old record without the field stays valid");
  assert.equal(legacy.date, "2026-11-17");
});

check("P1-13: the hook and UI really wire the three choices", () => {
  const hook = readFileSync(join(ROOT, "src", "hooks", "useWardData.ts"), "utf8");
  assert.match(hook, /applyCarryoverDecision\(\{/);
  assert.match(hook, /carryoverState\(history/);
  const home = readFileSync(join(ROOT, "src", "components", "views", "Home.tsx"), "utf8");
  assert.match(home, /handleCarryover\("continue"\)/);
  assert.match(home, /handleCarryover\("add"\)/);
  assert.match(home, /handleCarryover\("postpone"\)/);
  const locale = readFileSync(join(ROOT, "src", "lib", "locale.ts"), "utf8");
  for (const key of ["home.carryoverContinue", "home.carryoverAdd", "home.carryoverPostpone"]) {
    assert.ok(locale.includes(`"${key}"`), `${key} exists in locale`);
  }
});

check("P1-14: the production carryover module was really compiled", () => {
  assert.ok(existsSync(join(ROOT, "src", "lib", "carryover.ts")));
  const src = readFileSync(join(ROOT, "src", "lib", "carryover.ts"), "utf8");
  assert.match(src, /export function applyCarryoverDecision/);
  assert.match(src, /No new storage key/);
});

for (const { name, fn } of checks) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
console.log(`\nP1 carryover correctness: ${passed}/${checks.length} checks passed`);
