/**
 * Quran-mode last-page regression harness.
 *
 * The reader used to reset `lastReadPage` to the range start before reading the
 * dedicated quran-page key, then let that reset value win over the saved page.
 * These checks compile the REAL mushafSession module with the project tsc and
 * exercise the storage behaviour with an in-memory localStorage fixture. No
 * browser or device data is read or written.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "quran-restore-test");
const LIB = join(ROOT, "src", "lib", "quran", "mushafSession.ts");

rmSync(OUT, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    LIB,
    "--outDir",
    OUT,
    "--rootDir",
    dirname(LIB),
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
  { cwd: ROOT, stdio: "pipe" },
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
    _map: map,
  };
}

globalThis.localStorage = makeStorage();
const LS = globalThis.localStorage;
const reset = () => LS.clear();
const snapshot = () => Object.fromEntries([...LS._map.entries()]);

const {
  MUSHAF_QURAN_LAST_PAGE_KEY: Q_PAGE,
  MUSHAF_QURAN_SESSION_KEY: Q_SESSION,
  MUSHAF_LAST_PAGE_KEY: WARD_PAGE,
  MUSHAF_SESSION_KEY: WARD_SESSION,
  defaultSession,
  saveQuranSession,
  loadQuranSession,
  resolveQuranResumePage,
  saveQuranResumePage,
} = await import(pathToFileURL(join(OUT, "mushafSession.js")).href);

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.log(`FAIL ${name}`);
    console.log(`     ${err.message}`);
  }
}

const quranSession = (lastReadPage) =>
  defaultSession({
    version: 1,
    source: "standalone",
    startPage: 1,
    endPage: 604,
    totalPages: 604,
    lastReadPage,
    highestPageReached: lastReadPage,
    sessionStartTime: new Date().toISOString(),
    bookmarks: [9],
    bookmark: 5,
    projectName: "test-context",
  });

/* 1 — the dedicated scalar key is the resume authority. */
check("saved quran page 127 is restored", () => {
  reset();
  LS.setItem(Q_PAGE, "127");
  assert.equal(resolveQuranResumePage(604), 127);
});

/* 2 — an install that only wrote the session still restores. */
check("quran session fallback restores older installs", () => {
  reset();
  saveQuranSession(quranSession(127));
  assert.equal(resolveQuranResumePage(604), 127);
});

/* 3 — a stale session mirror cannot override the explicit page key. */
check("explicit quran page wins over a conflicting session", () => {
  reset();
  LS.setItem(Q_PAGE, "127");
  saveQuranSession(quranSession(200));
  assert.equal(resolveQuranResumePage(604), 127);
});

/* 4 — pre-v2 ward page data is still usable, never deleted. */
check("legacy ward page is the last-resort fallback", () => {
  reset();
  LS.setItem(WARD_PAGE, "127");
  assert.equal(resolveQuranResumePage(604), 127);
  assert.equal(LS.getItem(WARD_PAGE), "127");
});

/* 5 — malformed and out-of-range values never become a resume target. */
check("malformed quran page falls through safely", () => {
  reset();
  LS.setItem(Q_PAGE, "999");
  saveQuranSession(quranSession(127));
  assert.equal(resolveQuranResumePage(604), 127);
  LS.setItem(Q_PAGE, "abc");
  assert.equal(resolveQuranResumePage(604), 127);
});

check("no usable page falls back to page 1", () => {
  reset();
  LS.setItem(Q_PAGE, "0");
  LS.setItem(Q_SESSION, "{not-json");
  assert.equal(resolveQuranResumePage(604), 1);
});

/* 6 — reading the resume point must not mutate storage. */
check("resolver is read-only", () => {
  reset();
  LS.setItem(Q_PAGE, "127");
  saveQuranSession(quranSession(127));
  const before = snapshot();
  resolveQuranResumePage(604);
  assert.deepEqual(snapshot(), before);
});

/* 7 — the writer updates the scalar key without destroying session context. */
check("recorder writes quran page and preserves session context", () => {
  reset();
  saveQuranSession(quranSession(127));
  assert.equal(saveQuranResumePage(200, 604), 200);
  assert.equal(LS.getItem(Q_PAGE), "200");
  const after = loadQuranSession();
  assert.deepEqual(after.bookmarks, [9]);
  assert.equal(after.bookmark, 5);
  assert.equal(after.projectName, "test-context");
  assert.equal(after.lastReadPage, 127, "the component patch owns the mirror");
});

check("recorder clamps invalid pages without deleting keys", () => {
  reset();
  LS.setItem(Q_SESSION, JSON.stringify(quranSession(127)));
  assert.equal(saveQuranResumePage(999, 604), 604);
  assert.equal(LS.getItem(Q_PAGE), "604");
  assert.equal(saveQuranResumePage(-4, 604), 1);
  assert.equal(LS.getItem(Q_SESSION) !== null, true);
});

/* 8 — the tafsir round trip is just another remount: storage must keep the page. */
check("tafsir return keeps the last page", () => {
  reset();
  saveQuranResumePage(200, 604);
  assert.equal(resolveQuranResumePage(604), 200);
  saveQuranResumePage(201, 604);
  assert.equal(resolveQuranResumePage(604), 201);
});

/* 9 — no storage key may be removed or renamed by this fix. */
check("all existing mushaf keys remain registered for backup/delete", () => {
  const src = readFileSync(join(ROOT, "src", "lib", "userData.ts"), "utf8");
  for (const key of [Q_PAGE, Q_SESSION, WARD_PAGE, WARD_SESSION]) {
    assert.equal(src.includes(`"${key}"`), true, `${key} missing from USER_DATA_KEYS`);
  }
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(`\nFailures:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
