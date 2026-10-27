/* ====================================================================
 * Dataset reload on reconnect / wake -- focused coverage
 * ====================================================================
 * The audit found a promise the app made in two languages and never kept.
 * `quran.dataOffline` tells the user the Quran text "will appear once you
 * reconnect" (AR: "سيظهر تلقائيًا عند عودة الاتصال"). Nothing implemented
 * that:
 *
 *   - the dataset load lived in an effect with `[]` deps, so it ran once per
 *     mount and never again;
 *   - `subscribeConnectivity` / `useConnectivity` were fully implemented in
 *     lib/net/connectivity.ts and unit-tested by test-offline.mjs, yet had ZERO
 *     callers in the app;
 *   - so a first launch while offline, or any transient fetch/hash failure,
 *     pinned the failure notice until the app was killed and restarted.
 *
 * The same trap covered two more files: hashes.json and ayah-meta.json are
 * fetched with NO IndexedDB cache, so an offline first launch also left
 * `hashes` empty and `meta` null PERMANENTLY. `meta` is what gives the Mushaf
 * reader real page/juz/quarter pagination -- without it every page lookup
 * returns null, the page index is hidden, and the page count silently falls
 * back to a hardcoded 604.
 *
 * A follow-up review then found two defects in the first version of this
 * feature, both of which this suite now pins with EXECUTED behaviour rather
 * than source patterns:
 *
 *   A) The three resources shared ONE attempt token, and each called
 *      settle() on its own. hashes.json (~430KB) lands long before
 *      quran.json (>1MB), so the first resolver released the in-flight slot
 *      while the dataset was still pending -- and an ordinary tab switch then
 *      started a SECOND full download, superseding the first result.
 *   B) settle() released the slot unconditionally, so a superseded attempt
 *      could unlock the guard belonging to its replacement.
 *   C) A rejected promise called abandon() and left datasetSettled false,
 *      pinning the UI on "loading" forever instead of showing an error.
 *
 * Everything in group C and F below runs the real compiled module.
 * ==================================================================== */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "dataset-reload-test");

const read = (r) => readFileSync(join(ROOT, ...r.split("/")), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Return the {...} block that starts after `marker`, by brace matching. */
function blockAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf("{", at + marker.length);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

/* ---------------------------------------------------------------- */
/* Import-graph walker, so "reachable" is measured, not assumed.    */
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
const ROOT_REL = ROOT.split(/[\\/]/).join("/");
const rel = (f) => f.split(/[\\/]/).join("/").replace(`${ROOT_REL}/`, "");
const REACHABLE_REL = new Set([...REACHABLE].map(rel));

const POLICY = "src/lib/quran/dataset-reload.ts";
const HOOK = "src/hooks/useQuran.ts";
const NET = "src/lib/net/connectivity.ts";
const HOOK_SRC = stripComments(read(HOOK));

/* ---------------------------------------------------------------- */
/* Compile the real policy module and execute it.                   */
/* ---------------------------------------------------------------- */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "lib", "quran", "dataset-reload.ts"),
    "--outDir", OUT,
    "--module", "commonjs", "--moduleResolution", "node",
    /* Match the project's real settings, otherwise the harness would compile
       the module more leniently than the app does. */
    "--strict", "--noImplicitOverride", "--forceConsistentCasingInFileNames",
    "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);
const policy = await import(pathToFileURL(join(OUT, "dataset-reload.js")).href);

/* ---------------------------------------------------------------- */

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/* ================================================================= */
/* C. Reload policy, executed for real                                */
/* ================================================================= */

check("C1: only an unverified outcome is retried", () => {
  assert.equal(policy.shouldReloadQuranData("verified"), false);
  assert.equal(policy.shouldReloadQuranData("offline"), true);
  assert.equal(policy.shouldReloadQuranData("error"), true);
  assert.equal(policy.shouldReloadQuranData("hash-mismatch"), true);
});

check("C2: a burst of wake events collapses into exactly one load", () => {
  const c = policy.createReloadCoordinator();
  assert.ok(c.start(), "the first attempt must be allowed");
  for (let i = 0; i < 50; i += 1) {
    assert.equal(c.start(), null, `wake event ${i} must not start a second load`);
  }
  assert.equal(c.attempts(), 1, "50 focus events must produce 1 attempt");
});

check("C3: the first attempt is the current one and retires its own slot", () => {
  const c = policy.createReloadCoordinator();
  const attempt = c.start();
  const outcome = attempt.settle();
  assert.equal(outcome.current, true, "an unopposed attempt must apply");
  assert.equal(outcome.released, true, "and it must retire the slot");
  assert.equal(c.inFlight(), false, "the slot must be free afterwards");
});

check("C4: a superseded attempt is dropped instead of overwriting fresher data", () => {
  const c = policy.createReloadCoordinator();
  const stale = c.start();
  /* cancel() stands in for unmount / a remount while a load was in flight. */
  c.cancel();
  const fresh = c.start();
  assert.ok(fresh, "a cancelled slot must be reusable, not wedged");
  assert.equal(stale.settle().current, false, "the superseded result must be discarded");
  assert.equal(fresh.settle().current, true, "the newest result must apply");
});

/* --- C5 rewritten. This is the regression test for review defect (B). --- */

check("C5: a stale settle must NOT release the slot a newer attempt owns", () => {
  const c = policy.createReloadCoordinator();
  const a = c.start();
  c.cancel();                 // A is now stale
  const b = c.start();        // B legitimately takes the slot
  assert.ok(b, "B must be able to take the freed slot");

  a.settle();                 // A lands late and must be powerless

  assert.equal(c.inFlight(), true, "B must still be in flight after A settled");
  assert.equal(c.start(), null, "a third start must be refused while B is active");
  assert.equal(c.active(), b, "B must still be the slot owner");

  const bOut = b.settle();
  assert.equal(bOut.current, true, "B is current, so B applies");
  assert.equal(bOut.released, true, "B retires its own slot");
  assert.equal(c.inFlight(), false, "and only now is the slot free");
  assert.ok(c.start(), "the slot is reusable afterwards");
});

check("C6: cancel invalidates in-flight work and allows a remount", () => {
  const c = policy.createReloadCoordinator();
  const a = c.start();
  c.cancel();
  assert.equal(a.settle().current, false, "cancelled work must not apply");
  assert.ok(c.start(), "a remount must not be blocked by a stale in-flight attempt");
});

check("C7: abandon releases the slot without applying anything", () => {
  const c = policy.createReloadCoordinator();
  const a = c.start();
  const out = a.abandon();
  assert.equal(out.current, true, "an unopposed abandon is still current");
  assert.equal(c.inFlight(), false, "abandon must leave the slot free");
  assert.ok(c.start(), "and the slot must be reusable");
});

/* --- C8 replaced: a genuinely rejected promise, not a manual abandon(). --- */

check("C8: a real rejected promise still settles and still frees the slot", async () => {
  const c = policy.createReloadCoordinator();
  const a = c.start();
  const boom = new Error("quran.json exploded");
  let settledCalls = 0;

  const report = await policy.runCoordinatedReload(a, {
    dataset: Promise.reject(boom),
    hashes: Promise.resolve(["abc"]),
    meta: Promise.resolve({ pages: 604 }),
    accept: () => true,
    onSettled: () => {
      settledCalls += 1;
    },
  });

  assert.equal(settledCalls, 1, "onSettled must run even though the dataset rejected");
  assert.equal(report.applied, true, "a rejection is reportable, not an escape hatch");
  assert.equal(report.dataset.ok, false, "the rejection must be reported, not swallowed");
  assert.equal(report.dataset.reason, boom, "with the original reason preserved");
  assert.equal(report.hashes.ok, true, "resources that DID resolve must still be reported");
  assert.equal(report.hashes.value[0], "abc");
  assert.equal(a.settled, true, "the attempt must be retired");
  assert.equal(c.inFlight(), false, "the slot must be free so the next wake can retry");
  assert.ok(c.start(), "a retry must be possible after a rejection");
});

check("C9: a rejection can never leave the load in a loading state", async () => {
  /* Every resource rejects at once -- the worst case. The aggregate must still
     settle exactly once and report every failure. */
  const c = policy.createReloadCoordinator();
  const a = c.start();
  let settledCalls = 0;
  const report = await policy.runCoordinatedReload(a, {
    dataset: Promise.reject(new Error("d")),
    hashes: Promise.reject(new Error("h")),
    meta: Promise.reject(new Error("m")),
    accept: () => true,
    onSettled: () => {
      settledCalls += 1;
    },
  });
  assert.equal(settledCalls, 1, "one settlement point, not three");
  assert.equal(report.dataset.ok, false);
  assert.equal(report.hashes.ok, false);
  assert.equal(report.meta.ok, false);
  assert.equal(c.inFlight(), false, "a triple rejection must not wedge the coordinator");
});

/* --- New: the slot is held until ALL THREE resources settle. --- */

check("C10: the in-flight slot is held until ALL THREE resources settle", async () => {
  const c = policy.createReloadCoordinator();
  const attempt = c.start();
  let settledCalls = 0;
  const run = policy.runCoordinatedReload(attempt, {
    dataset: delay(60).then(() => "d"),
    hashes: delay(5).then(() => ["h"]),
    meta: delay(5).then(() => "m"),
    accept: () => true,
    onSettled: () => {
      settledCalls += 1;
    },
  });

  /* hashes and meta are long done; the dataset is still pending. Nothing may
     have settled yet, and no wake event may slip through. */
  await delay(25);
  assert.equal(settledCalls, 0, "nothing may settle while the dataset is pending");
  assert.equal(c.inFlight(), true, "the slot must stay held while the dataset pends");
  assert.equal(c.start(), null, "a wake event mid-load must NOT start a second reload");

  const report = await run;
  assert.equal(settledCalls, 1, "exactly one settlement point for the whole operation");
  assert.equal(report.applied, true);
  assert.equal(report.dataset.value, "d");
  assert.equal(report.hashes.value[0], "h");
  assert.equal(report.meta.value, "m");
  assert.equal(c.inFlight(), false, "the slot is released only after the whole operation");
  assert.ok(c.start(), "and the slot is reusable afterwards");
});

check("C11: many wake events during one ACTIVE reload produce exactly one reload", async () => {
  const c = policy.createReloadCoordinator();
  const attempt = c.start();
  const run = policy.runCoordinatedReload(attempt, {
    dataset: delay(50).then(() => "d"),
    hashes: delay(50).then(() => []),
    meta: delay(50).then(() => null),
  });
  /* focus + visibilitychange + pageshow + online, all mid-load. */
  for (let i = 0; i < 100; i += 1) {
    assert.equal(c.start(), null, `wake ${i} started a second reload`);
  }
  await run;
  assert.equal(c.inFlight(), false);
  /* A second settle must be a clean no-op and must not claim the slot again. */
  const again = attempt.settle();
  assert.equal(again.current, false, "an attempt that already reported cannot apply again");
  assert.equal(again.released, false, "nor release anything");
});

/* --- New: stale results must not write any current state. --- */

check("C12: a superseded reload cannot write dataset, hashes or meta", async () => {
  const c = policy.createReloadCoordinator();
  const stale = c.start();
  c.cancel();                       // unmount/remount: `stale` is now superseded
  const fresh = c.start();
  const applied = [];

  /* A permissive accept() on purpose: staleness alone must veto the write. */
  const report = await policy.runCoordinatedReload(stale, {
    dataset: Promise.resolve("STALE-dataset"),
    hashes: Promise.resolve(["STALE"]),
    meta: Promise.resolve({ tag: "STALE" }),
    accept: () => true,
    onSettled: () => applied.push("stale"),
  });

  assert.equal(report.applied, false, "a stale attempt must not apply");
  assert.deepEqual(applied, [], "onSettled must not run for a stale attempt");
  assert.equal(report.dataset.ok, true, "the data is still reported to the caller...");
  assert.equal(c.active(), fresh, "...but it must not have touched the current slot");
  assert.equal(fresh.settle().current, true, "the live attempt still applies normally");
});

/* ================================================================= */
/* F. The hook's wiring, proved by an executable shared-slot oracle   */
/* ================================================================= */

/** A promise plus its resolver, so the simulation controls timing exactly. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Simulate one load, settle the two small resources, then perform a routine tab
 * switch while the big file is still in flight. Returns how many reloads
 * actually started.
 *
 * Explicit deferreds rather than timers: with 40ms/15ms sleeps, a busy machine
 * could settle quran.json before the simulated tab switch, so F1 could fail
 * without any code regression. The ordering here is the invariant under test.
 *
 * `shape` selects the hook's settlement strategy:
 *   "aggregate"    -- one settlement point after all three (current design)
 *   "perResource"  -- each resource settles the shared attempt (the old bug)
 */
async function simulateWakeWindow(shape) {
  const c = policy.createReloadCoordinator();
  let loads = 0;
  let done = Promise.resolve();

  const wake = () => {
    const attempt = c.start();
    if (!attempt) return null;
    loads += 1;
    const dataset = deferred();
    const hashes = deferred();
    const meta = deferred();
    if (shape === "aggregate") {
      done = policy.runCoordinatedReload(attempt, {
        dataset: dataset.promise,
        hashes: hashes.promise,
        meta: meta.promise,
      });
    } else {
      /* The old shape, reproduced faithfully: every resource settles the one
         shared attempt as soon as it lands. */
      void hashes.promise.then(() => ["h"]).then(() => attempt.settle());
      void meta.promise.then(() => null).then(() => attempt.settle());
      void dataset.promise.then(() => "d").then(() => attempt.settle());
    }
    return { dataset, hashes, meta };
  };

  const first = wake();
  first.hashes.resolve(["h"]);
  first.meta.resolve(null);
  /* Let the small resources settle and their continuation microtasks run. On
     the aggregate path the slot is still held; on the per-resource path it is
     already free -- which is exactly the bug F2 proves this oracle can see. */
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  wake(); // tab switch while quran.json is still pending
  first.dataset.resolve("d");
  await done;
  await Promise.resolve();
  await Promise.resolve();
  return loads;
}

check("F1: the real hook shape keeps the slot held, so a tab switch mid-load does not re-download", async () => {
  assert.ok(
    /runCoordinatedReload\(attempt,/.test(HOOK_SRC),
    "useQuran must route the three resources through runCoordinatedReload"
  );
  assert.equal(
    await simulateWakeWindow("aggregate"),
    1,
    "one tab switch during an active reload must not start a second download"
  );
});

check("F2: the oracle still detects the old bug (it is not a vacuous test)", async () => {
  /* If this ever reports 1, the oracle has lost the power to catch a
     regression to per-resource settlement, and F1 would be meaningless. */
  assert.equal(
    await simulateWakeWindow("perResource"),
    2,
    "the per-resource shape really does start a second reload -- that is the bug under test"
  );
});

check("F3: the hook never settles or abandons the attempt itself", () => {
  /* Reintroducing either call in the hook would restore the shared-slot bug,
     because the three resources resolve at different times. */
  assert.ok(
    !/attempt\.settle\(/.test(HOOK_SRC),
    "only runCoordinatedReload may settle the attempt"
  );
  assert.ok(
    !/attempt\.abandon\(/.test(HOOK_SRC),
    "a rejection is a value now; the hook must not abandon on it"
  );
  assert.ok(
    !/\.then\(\s*\(h\)\s*=>\s*\{?\s*if\s*\(accept/.test(HOOK_SRC),
    "hashes must not have its own accept() gate"
  );
});

/* ================================================================= */
/* A. The infrastructure is actually wired                            */
/* ================================================================= */

check("A1: the policy module is reachable from the app entry points", () => {
  assert.ok(REACHABLE_REL.has(POLICY), `${POLICY} must be reachable`);
});

check("A2: useQuran imports and calls subscribeConnectivity", () => {
  assert.ok(
    /import \{ subscribeConnectivity \} from "@\/lib\/net\/connectivity"/.test(HOOK_SRC),
    "useQuran must import the real subscription helper"
  );
  assert.ok(/subscribeConnectivity\(\(online\) =>/.test(HOOK_SRC), "useQuran must subscribe, not poll");
  assert.ok(/if \(online\) refreshIfUnverified\(\);/.test(HOOK_SRC), "only the transition back online retries");
});

check("A3: the retry is gated on the status, so verified data is never re-fetched", () => {
  assert.ok(/shouldReloadQuranData\(statusRef\.current\)/.test(HOOK_SRC), "must consult the policy");
  assert.ok(!/statusRef\.current !== "verified"/.test(HOOK_SRC), "the policy owns the decision");
});

check("A4: every wake trigger is added and removed with the SAME handler reference", () => {
  for (const [target, event] of [
    ["document", "visibilitychange"],
    ["window", "focus"],
    ["window", "pageshow"],
  ]) {
    const added = new RegExp(`${target}\\.addEventListener\\("${event}", ([A-Za-z]+)\\)`).exec(HOOK_SRC);
    const removed = new RegExp(`${target}\\.removeEventListener\\("${event}", ([A-Za-z]+)\\)`).exec(HOOK_SRC);
    assert.ok(added, `missing wake trigger: ${target} "${event}"`);
    assert.ok(removed, `missing cleanup for: ${target} "${event}"`);
    assert.equal(
      removed[1],
      added[1],
      `${target} "${event}" was added as "${added[1]}" but removed as "${removed[1]}" -- the listener would leak`
    );
  }
  assert.ok(/document\.visibilityState === "visible"/.test(HOOK_SRC), "only hidden->visible matters");
});

check("A5: the subscription is unsubscribed on unmount", () => {
  assert.ok(/const unsubscribe = subscribeConnectivity/.test(HOOK_SRC), "must keep the unsubscriber");
  assert.ok(/return \(\) => \{\s*unsubscribe\(\);/.test(HOOK_SRC), "cleanup must call it");
});

/* ================================================================= */
/* B. The retry promise in quran.dataOffline is now kept              */
/* ================================================================= */

check("B1: hashes and ayah-meta retry too, not just the dataset", () => {
  for (const fn of ["loadDatasetWithStatus", "loadHashes", "loadAyahMeta"]) {
    assert.ok(new RegExp(`${fn}\\(\\)`).test(HOOK_SRC), `${fn} must be inside the coordinated load`);
  }
  const coordinated = blockAfter(HOOK_SRC, "runCoordinatedReload(attempt");
  assert.ok(coordinated, "could not locate the coordinated load block");
  for (const fn of ["loadDatasetWithStatus()", "loadHashes()", "loadAyahMeta()"]) {
    assert.ok(coordinated.includes(fn), `${fn} must be passed to the coordinated load`);
  }
});

check("B2: the offline copy still promises recovery, and recovery now exists", () => {
  const locale = read("src/lib/locale.ts");
  const values = [...locale.matchAll(/"quran\.dataOffline": "([^"]*)"/g)].map((m) => m[1]);
  assert.equal(values.length, 2, "the key needs an ar and an en value");
  assert.ok(values.some((v) => /اتصال|reconnect/i.test(v)), "the promise wording must still be present");
  assert.ok(/subscribeConnectivity/.test(HOOK_SRC), "the promise needs the retry to stay honest");
});

check("B3: settled is reset when a retry starts, then set when it lands", () => {
  const start = HOOK_SRC.indexOf("const attempt = coordinator.start()");
  assert.ok(start > -1, "loadQuranData body not found");
  const body = HOOK_SRC.slice(start, start + 400);
  assert.ok(/setDatasetSettled\(false\)/.test(body), "a retry must show loading, not keep the old notice");
  assert.ok(/if \(!attempt\) return;/.test(body), "a refused burst must not fall through");
  assert.equal(
    HOOK_SRC.split("setDatasetSettled(true)").length - 1,
    1,
    "there must be exactly one settled-true transition, so no path can strand it on loading"
  );
});

/* ================================================================= */
/* D. Data integrity is untouched                                     */
/* ================================================================= */

check("D1: store.ts still refuses hash-mismatched text", () => {
  const src = read("src/lib/quran/store.ts");
  assert.ok(/const hex = await sha256Text\(text\);\s*\n\s*return hex === DATASET_SHA256;/.test(src));
  assert.ok(/return \{ dataset: null, status: "hash-mismatch" \};/.test(src));
  assert.ok(/if \(cached && \(await verifyText\(cached\.text\)\)\)/.test(src), "the cache is still re-verified on read");
});

check("D2: connectivity.ts was not modified -- it was already correct", () => {
  const src = read(NET);
  assert.ok(/export function subscribeConnectivity/.test(src));
  assert.ok(/window\.addEventListener\("online", onOnline\)/.test(src));
  assert.ok(/window\.removeEventListener\("online", onOnline\)/.test(src));
  assert.ok(/if \(typeof window === "undefined"\) \{\s*return \(\) => undefined;/.test(src), "must stay server-safe");
});

/* --- D3 strengthened: the guard must actually WRAP the state writes. --- */

check("D3: every dataset/hash/meta write sits BEHIND the stale-apply guard", () => {
  const body = blockAfter(HOOK_SRC, "}).then((report) =>");
  assert.ok(body, "could not locate the report handler");
  const guardAt = body.indexOf("if (!report.applied) return;");
  assert.ok(guardAt > -1, "the stale/apply guard must exist before any state write");

  const setters = ["setDataset(", "setDatasetStatus(", "statusRef.current =", "setHashes(", "setMeta("];
  for (const setter of setters) {
    let at = body.indexOf(setter);
    assert.ok(at > -1, `${setter} must exist in the report handler`);
    /* Every occurrence, not just the first: a later unguarded write is the
       exact regression this check exists for. */
    while (at > -1) {
      assert.ok(at > guardAt, `${setter} appears BEFORE the guard (offset ${at})`);
      at = body.indexOf(setter, at + 1);
    }
  }
});

check("D4: datasetStatus is only ever the loader's own status or an honest error", () => {
  const body = blockAfter(HOOK_SRC, "}).then((report) =>");
  const assignments = [...body.matchAll(/setDatasetStatus\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(assignments.length > 0, "no status assignment found");
  for (const a of assignments) {
    assert.match(
      a,
      /^ds\.ok \? ds\.value\.status : "error"$/,
      `datasetStatus must come straight from the loader, found: ${a}`
    );
  }
  assert.match(
    body,
    /statusRef\.current = ds\.ok \? ds\.value\.status : "error";/,
    "the retry gate mirror must track the same value, never an invented 'verified'"
  );
});

check("D5: a rejection still reaches a settled state", () => {
  const onSettled = blockAfter(HOOK_SRC, "onSettled: () =>");
  assert.ok(onSettled, "the coordinated load must declare onSettled");
  assert.ok(
    /setDatasetSettled\(true\)/.test(onSettled),
    "onSettled must mark the load settled on EVERY path, including a rejection"
  );
  assert.ok(
    /accept: \(\) => aliveRef\.current/.test(HOOK_SRC),
    "the mount guard must be read at settlement time"
  );
});

check("D6: dataset null and verified stay mutually exclusive", () => {
  const src = read("src/lib/quran/store.ts");
  assert.ok(/return \{ dataset, status: "verified" \};/.test(src));
  for (const bad of ['status: "hash-mismatch"', 'status: "error"']) {
    const idx = src.indexOf(bad);
    assert.ok(src.slice(Math.max(0, idx - 40), idx).includes("dataset: null"), `${bad} must not ship a dataset`);
  }
});

/* ================================================================= */
/* E. No scope creep                                                  */
/* ================================================================= */

check("E1: no new dependency was added", () => {
  const pkg = JSON.parse(read("package.json"));
  /* `adhan` is not a new dependency: src/lib/prayer.ts has always imported it
     and the manifest was simply missing it, which broke clean installs. It is
     listed here so the guard still catches anything genuinely new. */
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), [
    "@capacitor/android", "@capacitor/cli", "@capacitor/core",
    "@capacitor/local-notifications", "adhan", "lucide-react", "next", "react", "react-dom",
  ]);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), [
    "@tailwindcss/postcss", "@types/node", "@types/react", "@types/react-dom",
    "eslint", "eslint-config-next", "tailwindcss", "typescript",
  ]);
  /* A dependency declared in the manifest but absent from the lock breaks
     `npm ci` before it can build anything, so the two files must agree. */
  const lock = JSON.parse(read("package-lock.json"));
  const unlocked = Object.keys(pkg.dependencies).filter(
    (name) => !lock.packages[`node_modules/${name}`],
  );
  assert.deepEqual(unlocked, [], `missing from package-lock.json: ${unlocked.join(", ")}`);
});

check("E2: no new locale key, storage key, route or tab", () => {
  const locale = read("src/lib/locale.ts");
  for (const key of ["quran.dataOffline", "quran.dataMismatch", "quran.dataError"]) {
    assert.equal(locale.split(`"${key}":`).length - 1, 2, `${key} must still appear exactly twice`);
  }
  const storage = read("src/lib/storage.ts");
  const keys = [...storage.matchAll(/const (?:V2|LEGACY)_\w+ = "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, 10, `storage key count changed: ${keys.length}`);
  assert.deepEqual(readdirSync(join(ROOT, "src", "app")).filter((f) => f.startsWith("page.")), ["page.tsx"]);
});

check("E3: no retry button or error boundary was introduced", () => {
  const app = readdirSync(join(ROOT, "src", "app"));
  assert.ok(!app.includes("error.tsx"));
  assert.ok(!app.includes("global-error.tsx"));
  const notice = stripComments(read("src/components/DatasetNotice.tsx"));
  assert.ok(!/onClick|Button/.test(notice), "the notice stays informational; the retry is automatic");
});

/* ---------------------------------------------------------------- */

/* `await fn()` matters: several checks below are async. Without the await, a
   failing async check would resolve after the loop and be silently counted as
   a pass -- the exact "green but broken" failure mode this suite exists to
   avoid. */
for (const { name, fn } of checks) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nDataset reload on reconnect: ${passed}/${checks.length} passed`);
if (passed !== checks.length) {
  console.error(`${checks.length - passed} check(s) failed.`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
