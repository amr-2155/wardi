/* ====================================================================
 * Quran dataset fetch timeout -- focused coverage
 * ====================================================================
 * The last defect left open by the Dataset Reload review:
 *
 *   store.ts called `fetch("/quran/quran.json")` with no AbortSignal and no
 *   timeout. Browsers impose no default fetch timeout, so a hung request
 *   (captive portal, half-open socket, a proxy that accepts the connection and
 *   never answers) leaves the coordinated reload's in-flight slot held FOREVER.
 *   No reconnect, focus or visibilitychange can recover from that, so the user
 *   is pinned on the failure notice exactly as before the reload feature.
 *
 * The fix bounds the WHOLE request, body included, with one AbortController.
 *
 * This suite compiles the real store.ts and executes it:
 *   - a hanging request must reject (proving the coordinator can settle);
 *   - a body that stalls AFTER headers must also reject -- the case a
 *     header-only timeout cannot catch;
 *   - the AbortSignal must actually reach fetch, and the timer must be cleared
 *     on success so a finished request is never aborted afterwards;
 *   - successful fetches, HTTP error messages, SHA-256 verification and
 *     hash-mismatch rejection must all behave exactly as before.
 * ==================================================================== */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "dataset-timeout-test");
const STORE = "src/lib/quran/store.ts";

const read = (r) => readFileSync(join(ROOT, ...r.split("/")), "utf8");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- */
/* Compile the real store module and execute it.                     */
/* ---------------------------------------------------------------- */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "lib", "quran", "store.ts"),
    "--outDir", OUT,
    "--module", "commonjs", "--moduleResolution", "node",
    /* Match the project so the harness is never more lenient than the app. */
    "--strict", "--noImplicitOverride", "--forceConsistentCasingInFileNames",
    "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);
const store = await import(pathToFileURL(join(OUT, "store.js")).href);

/* The genuine dataset, so "verified" is proven against the real pinned hash. */
const REAL_TEXT = read("public/quran/quran.json");

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/** A fetch that never answers but honours the abort signal, like the real one. */
const hangingFetch = (_url, init) =>
  new Promise((_res, rej) => {
    init.signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
  });

/** Headers arrive, then the body stalls forever. */
const stalledBodyFetch = (_url, init) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () =>
      new Promise((_r, rej) => {
        init.signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
      }),
  });

/** Swap globalThis.fetch for the duration of `fn`, then restore it. */
async function withGlobalFetch(fn, impl) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

/**
 * Fail loudly instead of hanging.
 *
 * If the timeout itself is broken the promise never settles, so a bare
 * `assert.rejects` would hang the whole suite rather than report a failure --
 * and a hang is indistinguishable from "still running". Every assertion that
 * depends on the abort working is therefore raced against a deadline.
 */
async function withDeadline(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_res, rej) => {
        timer = setTimeout(
          () => rej(new Error(`${label} did not settle within ${ms}ms -- the request timeout is NOT working`)),
          ms
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================================= */
/* T. The hanging-request guarantee                                    */
/* ================================================================= */

check("T1: a hanging request eventually rejects instead of hanging forever", async () => {
  const started = Date.now();
  await withDeadline(
    assert.rejects(
      () => store.fetchQuranDatasetText(60, hangingFetch),
      (err) => {
        assert.ok(err instanceof Error, "the abort must surface as a rejection");
        assert.equal(err.name, "AbortError", "and it must be an abort, not a silent success");
        return true;
      }
    ),
    4000,
    "T1"
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3000, `it must give up quickly, took ${elapsed}ms`);
});

check("T2: a body that stalls AFTER the headers also rejects", async () => {
  /* This is the case a header-only timeout silently misses. */
  const started = Date.now();
  await withDeadline(
    assert.rejects(
      () => store.fetchQuranDatasetText(60, stalledBodyFetch),
      (err) => {
        assert.equal(err.name, "AbortError");
        return true;
      }
    ),
    4000,
    "T2"
  );
  assert.ok(Date.now() - started < 3000, "a stalled body must not be able to pin the load");
});

check("T3: the AbortSignal actually reaches fetch", async () => {
  let seen = null;
  await store.fetchQuranDatasetText(1000, async (_url, init) => {
    seen = init?.signal;
    return { ok: true, status: 200, text: async () => REAL_TEXT };
  });
  assert.ok(seen instanceof AbortSignal, "fetch must be given a real AbortSignal, or it cannot be cancelled");
});

check("T4: the timer is cleared on success, so a finished request is never aborted", async () => {
  let abortedAfterSuccess = false;
  await store.fetchQuranDatasetText(40, async (_url, init) => {
    init.signal.addEventListener("abort", () => {
      abortedAfterSuccess = true;
    });
    return { ok: true, status: 200, text: async () => "ok" };
  });
  /* Well past the timeout: a leaked timer would have fired by now. */
  await delay(150);
  assert.equal(abortedAfterSuccess, false, "a completed request must not be aborted afterwards");
});

/* ================================================================= */
/* Successful and failing behaviour must be unchanged                */
/* ================================================================= */

check("T5: a successful fetch returns the body byte-for-byte", async () => {
  const text = await store.fetchQuranDatasetText(1000, async () => ({
    ok: true,
    status: 200,
    text: async () => REAL_TEXT,
  }));
  assert.equal(text, REAL_TEXT, "the dataset text must pass through untouched");
});

check("T6: an HTTP failure still throws the same message as before", async () => {
  await assert.rejects(
    () => store.fetchQuranDatasetText(1000, async () => ({ ok: false, status: 404 })),
    /fetch failed: 404/,
    "the existing error contract must be preserved"
  );
  await assert.rejects(
    () => store.fetchQuranDatasetText(1000, async () => ({ ok: false, status: 500 })),
    /fetch failed: 500/
  );
});

check("T7: SHA-256 verification still runs after a successful fetch", async () => {
  const res = await withGlobalFetch(
    () => store.loadDataset(),
    async () => ({ ok: true, status: 200, text: async () => REAL_TEXT })
  );
  assert.equal(res.status, "verified", "the real pinned dataset must verify");
  assert.ok(res.dataset, "and must be returned");
  assert.equal(res.dataset.manifest.totalAyahs, 6236, "the parsed dataset must be intact");
});

check("T8: hash-mismatch is still rejected, and ships no dataset", async () => {
  const res = await withGlobalFetch(
    () => store.loadDataset(),
    async () => ({ ok: true, status: 200, text: async () => `${REAL_TEXT} ` })
  );
  assert.equal(res.status, "hash-mismatch", "tampered text must be refused");
  assert.equal(res.dataset, null, "and must never ship a dataset");
});

check("T9: an aborted load surfaces as an honest error, not a stuck load", async () => {
  /* An abort rejects exactly the way this simulates, so this proves the
     composition: the coordinator receives a settled promise with status
     "error", which is what lets its in-flight slot be released. */
  const res = await withGlobalFetch(
    () => store.loadDataset(),
    () => Promise.reject(new DOMException("Aborted", "AbortError"))
  );
  assert.equal(res.status, "error", "a rejected request must resolve to an error status");
  assert.equal(res.dataset, null, "and must not ship a dataset");
});

check("T10: the offline-first order and integrity gate are unchanged", () => {
  const src = read(STORE);
  const cacheRead = src.indexOf("await idbGet<{ text: string }>(CACHE_KEY)");
  const cachedVerify = src.indexOf("await verifyText(cached.text)");
  const network = src.indexOf("await fetchQuranDatasetText()");
  const fetchedVerify = src.indexOf("await verifyText(text)");
  const cacheWrite = src.indexOf("await idbSet(CACHE_KEY, { text })");

  assert.ok(cacheRead > -1, "the IndexedDB read must still be there");
  assert.ok(cacheRead < cachedVerify, "a cached entry is still re-verified before it is trusted");
  assert.ok(cachedVerify < network, "the network is still only reached when the cache cannot be trusted");
  assert.ok(network < fetchedVerify, "fetched text must be verified before use");
  assert.ok(fetchedVerify < cacheWrite, "nothing unverified may be cached");

  /* loadDataset must not reach for fetch itself -- only through the bounded
     helper. Checked inside the function body, not the whole file. */
  const start = src.indexOf("export async function loadDataset(");
  assert.ok(start > -1, "loadDataset not found");
  const end = src.indexOf("\nexport ", start + 10);
  const body = src.slice(start, end > -1 ? end : undefined);
  assert.ok(
    !/\bfetch\(/.test(body),
    "loadDataset must not call fetch() directly; the bounded helper is the only path to the network"
  );
  assert.ok(body.includes("fetchQuranDatasetText("), "loadDataset must go through the bounded helper");
});

check("T11: the default timeout is finite and not aggressive", () => {
  const src = read(STORE);
  const m = /const DATASET_FETCH_TIMEOUT_MS = ([\d_]+);/.exec(src);
  assert.ok(m, "a default timeout constant must exist");
  const ms = Number(m[1].replace(/_/g, ""));
  assert.ok(Number.isFinite(ms) && ms > 0, "the default timeout must be finite");
  assert.ok(ms >= 15000, `~1.5MB on a slow link needs room, got ${ms}ms`);
  assert.ok(/setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/.test(src), "the timer must actually abort");
  assert.ok(/clearTimeout\(timer\)/.test(src), "the timer must be cleared");
  assert.ok(/signal: controller\.signal/.test(src), "the signal must be passed to fetch");
});

check("T12: no dependency, storage key, route or scope creep", () => {
  const pkg = JSON.parse(read("package.json"));
  /* `adhan` is declared because src/lib/prayer.ts imports it; it was already in
     use, only missing from the manifest. The guard still catches new packages. */
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), [
    "@capacitor/android", "@capacitor/cli", "@capacitor/core",
    "@capacitor/local-notifications", "adhan", "lucide-react", "next", "react", "react-dom",
  ]);
  const storage = read("src/lib/storage.ts");
  const keys = [...storage.matchAll(/const (?:V2|LEGACY)_\w+ = "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, 10, `storage key count changed: ${keys.length}`);
  /* store.ts keeps exactly its original cache keys -- no new persistence. */
  const store = read(STORE);
  assert.deepEqual(
    [...store.matchAll(/const CACHE_KEY = "([^"]+)"/g)].map((m) => m[1]),
    ["quran-v1"],
    "the dataset cache key must be unchanged"
  );
});

/* ---------------------------------------------------------------- */

for (const { name, fn } of checks) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nDataset fetch timeout: ${passed}/${checks.length} passed`);
if (passed !== checks.length) {
  console.error(`${checks.length - passed} check(s) failed.`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
