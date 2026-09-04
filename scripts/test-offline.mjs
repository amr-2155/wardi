/**
 * Offline-hardening tests — exercises the ACTUAL retry/error/position
 * logic (mock fetch, injected timers), not source text.
 *
 * Mirrors scripts/test-audio.mjs infrastructure: compile the covered
 * modules with the project tsc into node_modules/.cache and import them.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "offline-test");

rmSync(OUT, { recursive: true, force: true });

const libFiles = [
  join(ROOT, "src", "lib", "net", "resilient-fetch.ts"),
  join(ROOT, "src", "lib", "net", "connectivity.ts"),
  join(ROOT, "src", "lib", "quran", "dataset-status.ts"),
  join(ROOT, "src", "lib", "audio", "storage.ts"),
  join(ROOT, "src", "lib", "audio", "playback.ts"),
];

execFileSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "bin", "tsc"), ...libFiles, "--outDir", OUT, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node"],
  { cwd: ROOT, stdio: "pipe" }
);

const mod = (p) => import(pathToFileURL(join(OUT, p)).href);

const { resilientFetch, ResilientFetchError, computeBackoffDelay } = await mod(
  join("net", "resilient-fetch.js")
);
const { isOnline, subscribeConnectivity } = await mod(
  join("net", "connectivity.js")
);
const { resolveDatasetUiStatus, loadDatasetWithStatus } = await mod(
  join("quran", "dataset-status.js")
);
const { loadAudioResume, saveAudioResume, clearAudioResume } = await mod(
  join("audio", "storage.js")
);
const { nextVerseIndex, resolveVerseFailureOutcome } = await mod(
  join("audio", "playback.js")
);

// Minimal localStorage mock (same convention as scripts/test-audio.mjs).
const store = {};
globalThis.localStorage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
  removeItem(key) {
    delete store[key];
  },
  clear() {
    for (const k of Object.keys(store)) delete store[k];
  },
};

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

// ---- helpers ----
const okResp = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? "OK" : `Status ${status}`,
  json: async () => ({}),
});

// Script-driven mock fetch: each entry is "network-error", "abort",
// or a canned response descriptor. Records calls + init for assertions.
function scriptFetch(script) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step === "network-error") throw new TypeError("fetch failed");
    if (step === "abort") throw new DOMException("aborted", "AbortError");
    return okResp(step.status ?? 200);
  };
  return { calls, fetchFn };
}

const immediateSleep = async () => undefined;
const recordSleep = (arr) => async (ms) => {
  arr.push(ms);
};

// ---- resilientFetch: timeout ----
check("timeout kind on abort with retries exhausted", async () => {
  const { calls, fetchFn } = scriptFetch(["abort"]);
  try {
    await resilientFetch("https://x.test/a", {
      fetchFn,
      sleepFn: immediateSleep,
      timeoutMs: 50,
      retries: 2,
    });
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof ResilientFetchError);
    assert.equal(e.kind, "timeout");
    assert.equal(calls.length, 3); // initial + 2 retries
  }
});

check("real AbortController wiring aborts a hanging request", async () => {
  let calls = 0;
  const hanging = (_url, init) =>
    new Promise((_resolve, reject) => {
      calls += 1;
      init.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      );
    });
  try {
    await resilientFetch("https://x.test/hang", {
      fetchFn: hanging,
      timeoutMs: 40,
      retries: 0,
    });
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof ResilientFetchError);
    assert.equal(e.kind, "timeout");
    assert.equal(calls, 1);
  }
});

// ---- resilientFetch: retry count ----
check("retries network errors then succeeds", async () => {
  const { calls, fetchFn } = scriptFetch(["network-error", "network-error", { status: 200 }]);
  const res = await resilientFetch("https://x.test/b", {
    fetchFn,
    sleepFn: immediateSleep,
  });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
});

check("retries retryable 503 then succeeds", async () => {
  const { calls, fetchFn } = scriptFetch([{ status: 503 }, { status: 200 }]);
  const res = await resilientFetch("https://x.test/c", {
    fetchFn,
    sleepFn: immediateSleep,
  });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

// ---- resilientFetch: no retry on 4xx ----
for (const status of [400, 404]) {
  check(`does not retry HTTP ${status}`, async () => {
    const { calls, fetchFn } = scriptFetch([{ status }]);
    try {
      await resilientFetch("https://x.test/d", { fetchFn, sleepFn: immediateSleep });
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof ResilientFetchError);
      assert.equal(e.kind, "http");
      assert.equal(e.status, status);
      assert.equal(calls.length, 1);
    }
  });
}

// ---- resilientFetch: backoff/jitter bounds (no slow timers) ----
check("backoff delays stay within documented bounds", async () => {
  const delays = [];
  const { fetchFn } = scriptFetch(["network-error"]);
  try {
    await resilientFetch("https://x.test/e", {
      fetchFn,
      sleepFn: recordSleep(delays),
      timeoutMs: 50,
      retries: 2,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      randFn: () => 0.999,
    });
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(e.kind, "network");
  }
  assert.equal(delays.length, 2);
  assert.ok(delays[0] >= 500 && delays[0] < 1000);
  assert.ok(delays[1] >= 1000 && delays[1] < 2000);
});

check("backoff respects maxDelayMs cap", () => {
  assert.equal(computeBackoffDelay(0, 500, 5000, 0), 500);
  assert.equal(computeBackoffDelay(1, 500, 5000, 0), 1000);
  assert.equal(computeBackoffDelay(10, 500, 600, 0), 600);
  assert.equal(computeBackoffDelay(10, 500, 600, 0.5), 850);
});

// ---- resilientFetch: offline + cause + method ----
check("offline short-circuit never touches the network", async () => {
  const { calls, fetchFn } = scriptFetch([{ status: 200 }]);
  try {
    await resilientFetch("https://x.test/f", {
      fetchFn,
      sleepFn: immediateSleep,
      onlineFn: () => false,
    });
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof ResilientFetchError);
    assert.equal(e.kind, "offline");
    assert.equal(calls.length, 0);
  }
});

check("original failure reason preserved on cause", async () => {
  const root = new TypeError("fetch failed");
  const fetchFn = async () => {
    throw root;
  };
  try {
    await resilientFetch("https://x.test/g", {
      fetchFn,
      sleepFn: immediateSleep,
      retries: 0,
    });
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(e.kind, "network");
    assert.equal(e.cause, root);
  }
});

check("requests are plain GETs (retry-safe by construction)", async () => {
  const { calls, fetchFn } = scriptFetch([{ status: 200 }]);
  await resilientFetch("https://x.test/h", { fetchFn, sleepFn: immediateSleep });
  assert.equal(calls[0].init?.method ?? "GET", "GET");
});

// ---- connectivity ----
check("isOnline defaults to true without navigator", () => {
  assert.equal(isOnline(), true);
});

check("subscribe returns a working unsubscribe outside the browser", () => {
  const unsub = subscribeConnectivity(() => {});
  assert.equal(typeof unsub, "function");
  unsub();
});

// ---- dataset status mapping ----
check("loader error + offline maps to offline status", () => {
  assert.equal(resolveDatasetUiStatus("error", false), "offline");
});

check("loader error + online stays a genuine error", () => {
  assert.equal(resolveDatasetUiStatus("error", true), "error");
});

check("verified and hash-mismatch pass through regardless of connectivity", () => {
  assert.equal(resolveDatasetUiStatus("verified", false), "verified");
  assert.equal(resolveDatasetUiStatus("verified", true), "verified");
  assert.equal(resolveDatasetUiStatus("hash-mismatch", false), "hash-mismatch");
  assert.equal(resolveDatasetUiStatus("hash-mismatch", true), "hash-mismatch");
});

check("wrapper maps stub loader results without touching the network", async () => {
  const errLoader = async () => ({ dataset: null, status: "error" });
  assert.equal((await loadDatasetWithStatus(errLoader, false)).status, "offline");
  assert.equal((await loadDatasetWithStatus(errLoader, true)).status, "error");
  const okLoader = async () => ({ dataset: { manifest: {} }, status: "verified" });
  const r = await loadDatasetWithStatus(okLoader, false);
  assert.equal(r.status, "verified");
  assert.deepEqual(r.dataset, { manifest: {} });
});

// ---- resume position storage ----
check("resume position save/load round-trips", () => {
  saveAudioResume({ surah: 2, ayah: 255, reciterId: "7" });
  assert.deepEqual(loadAudioResume(), { surah: 2, ayah: 255, reciterId: "7" });
  clearAudioResume();
});

check("clear removes the resume position", () => {
  saveAudioResume({ surah: 36, ayah: 1, reciterId: "7" });
  clearAudioResume();
  assert.equal(loadAudioResume(), null);
});

check("resume load rejects malformed and out-of-range values", () => {
  localStorage.setItem("wardi:audio:resume-v1", "not-json");
  assert.equal(loadAudioResume(), null);
  saveAudioResume({ surah: 0, ayah: 1, reciterId: "7" });
  assert.equal(loadAudioResume(), null);
  saveAudioResume({ surah: 2, ayah: 999, reciterId: "7" });
  assert.equal(loadAudioResume(), null);
  saveAudioResume({ surah: 2, ayah: 5, reciterId: "" });
  assert.equal(loadAudioResume(), null);
  clearAudioResume();
});

// ---- fail-stop decision logic (no silent verse skip) ----
check("verse advance steps through the queue to genuine completion", () => {
  assert.equal(nextVerseIndex(7, 0), 1);
  assert.equal(nextVerseIndex(7, 5), 6);
  assert.equal(nextVerseIndex(7, 6), null);
  assert.equal(nextVerseIndex(1, 0), null);
  assert.equal(nextVerseIndex(0, 0), null);
});

check("first failure retries the same verse, second failure fail-stops", () => {
  assert.equal(resolveVerseFailureOutcome(false), "retry-same");
  assert.equal(resolveVerseFailureOutcome(true), "fail-stop");
});

// ---- runner ----
let passed = 0;
for (const { name, fn } of checks) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);
