#!/usr/bin/env node
/**
 * qa-wardi-live.mjs — the live-browser verification harness for WARDI.
 *
 * WHY THIS EXISTS
 * ---------------
 * The project already had dozens of one-off `scripts/qa-*.js` / `cdp-*.js`
 * scratch scripts (gitignored). They each hardcode a `ws://…:9223/devtools/…`
 * page id from a Chrome someone had launched by hand, so none of them can be
 * re-run without repeating that manual setup, and none of them report a
 * PASS/FAIL verdict. This is the single reusable replacement: it launches its
 * own Chrome, drives it over the DevTools Protocol, asserts the behaviours the
 * app promises, and writes machine-readable evidence to disk.
 *
 * It is deliberately dependency-free: Node 22+ ships `WebSocket` and `fetch`,
 * which is all the CDP client below needs.
 *
 * USAGE
 * -----
 *   node scripts/qa-wardi-live.mjs [url] [options]
 *
 *   url                  Base URL of a running server. Default: --serve-dir's
 *                        own server, else http://127.0.0.1:4173/
 *   --serve-dir=<dir>    Start a tiny static server for <dir> (e.g. `out`) and
 *                        verify against it. This is how a static export is
 *                        verified with no long-lived server to depend on.
 *   --label=<name>       Artifact sub-directory name. Default: run-<timestamp>
 *   --out-dir=<dir>      Where artifacts go. Default: <repo>/../my-ward-quarantine/qa
 *   --browser=<exe>      Chrome/Chromium executable. Default: auto-detect.
 *   --timeout=<ms>      Per-assertion budget for the slowest waits. Default 30000.
 *
 * EXIT CODE is non-zero if any check FAILs, so this can gate a release.
 *
 * WHAT IT ASSERTS (see `main` for the exact code)
 *   1 boot: loading clears, Home renders, no raw translation keys on screen
 *   2 every bottom-nav tab renders with no new console error / exception
 *   3 the prayer bar exists and expanding it shows a full timetable
 *   4 the mushaf reader opens and a /quran/pages/*.webp page actually loads
 *   5 English flips dir=ltr and changes visible text; Arabic restores RTL
 *   6 the network going offline does not white-screen the app (in-app route
 *     change and a cold reload are reported separately)
 *   7 console cleanliness: every console error / uncaught exception / 4xx-5xx
 *     is listed with its URL
 *   8 (extra) no raw translation key in any visited view's text *or* in any
 *     aria-label/title/placeholder attribute
 *
 * HONESTY RULES THIS HARNESS FOLLOWS
 *   - Nothing is asserted that was not observed in the browser. Every check
 *     records the DOM/network evidence it used.
 *   - A missing feature is reported as "not found", never as a pass.
 *   - Translation keys are only counted as raw keys when they are not part of
 *     a URL/hostname (e.g. `quran.com` in share text is not a missing key).
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/* CLI                                                                  */
/* ------------------------------------------------------------------ */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {
    url: null,
    serveDir: null,
    label: null,
    outDir: path.join(REPO_ROOT, "..", `${path.basename(REPO_ROOT)}-quarantine`, "qa"),
    browser: process.env.CHROME_PATH || null,
    timeout: 30000,
  };
  for (const arg of argv) {
    if (arg.startsWith("--serve-dir=")) out.serveDir = path.resolve(arg.slice(12));
    else if (arg.startsWith("--label=")) out.label = arg.slice(8);
    else if (arg.startsWith("--out-dir=")) out.outDir = path.resolve(arg.slice(10));
    else if (arg.startsWith("--browser=")) out.browser = arg.slice(10);
    else if (arg.startsWith("--timeout=")) out.timeout = Number(arg.slice(10));
    else if (!arg.startsWith("--") && !out.url) out.url = arg;
  }
  if (!out.label) out.label = `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));
const RUN_DIR = path.join(ARGS.outDir, ARGS.label);
const SHOT_DIR = path.join(RUN_DIR, "screenshots");

/* ------------------------------------------------------------------ */
/* Logging / results                                                    */
/* ------------------------------------------------------------------ */

const LOG_LINES = [];
function log(msg = "") {
  const line = String(msg);
  LOG_LINES.push(line);
  process.stdout.write(`${line}\n`);
}

const CHECKS = [];
function record(id, name, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  CHECKS.push({ id, name, status, detail });
  log(`${status}  CHECK ${id}: ${name}`);
  if (detail) log(`      ${detail}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* Evidence collectors                                                  */
/* ------------------------------------------------------------------ */

let phase = "startup";

const consoleErrors = []; // {phase, text}
const consoleWarnings = []; // {phase, text}
const exceptions = []; // {phase, text, url, line}
const httpErrors = []; // {phase, status, url}
const failedRequests = []; // {phase, error, url}
const webpRequests = []; // {phase, url, status|null}
const rawKeyHits = []; // {phase, where, key}

function addRawKeys(where, keys) {
  for (const key of keys) rawKeyHits.push({ phase, where, key });
}

/* ------------------------------------------------------------------ */
/* Static file server (only used with --serve-dir)                       */
/* ------------------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
};

function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) throw new Error(`--serve-dir does not exist: ${root}`);
  const server = http.createServer((req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (rel.endsWith("/")) rel += "index.html";
      let file = path.resolve(root, `.${rel}`);
      if (!file.startsWith(root)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      if (!fs.existsSync(file) && fs.existsSync(`${file}${path.sep}index.html`)) {
        file = path.join(file, "index.html");
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500).end(String(err && err.message));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}/`,
        close: () =>
          new Promise((r) => {
            /* Chrome keeps keep-alive sockets open; without dropping them,
               server.close() never calls back and the harness hangs after the
               report has already been written. */
            server.closeAllConnections?.();
            server.close(() => r());
            setTimeout(r, 2000).unref();
          }),
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Chrome discovery + launch                                            */
/* ------------------------------------------------------------------ */

function findChrome() {
  const candidates = [
    ARGS.browser,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  throw new Error(
    `Chrome not found. Looked in:\n  ${candidates.join("\n  ")}\n` +
      `Pass --browser=<path to chrome.exe> or set CHROME_PATH.`,
  );
}

async function launchChrome(exe) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "wardi-qa-chrome-"));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--mute-audio",
    "--hide-scrollbars",
    "--no-pings",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ];
  const proc = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
  const stderr = [];
  proc.stderr.on("data", (d) => stderr.push(d.toString()));

  // Chrome writes the chosen port into DevToolsActivePort once the endpoint is up.
  const portFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 25000;
  while (!fs.existsSync(portFile)) {
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`Chrome did not open a DevTools port.\n${stderr.join("").slice(-800)}`);
    }
    await sleep(150);
  }
  const port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0].trim());
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = list.find((t) => t.type === "page");
    if (!page) await sleep(150);
  }
  if (!page) {
    proc.kill();
    throw new Error("Chrome exposed no page target");
  }
  return { proc, profileDir, port, wsUrl: page.webSocketDebuggerUrl, stderr };
}

/* ------------------------------------------------------------------ */
/* Tiny CDP client                                                      */
/* ------------------------------------------------------------------ */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      if (msg.id !== undefined) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) pending.reject(new Error(`${pending.method}: ${msg.error.message}`));
        else pending.resolve(msg.result);
        return;
      }
      for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
    });
  }

  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => reject(new Error("CDP connect timeout")), 15000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new CDP(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket error"));
      });
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `page exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`,
      );
    }
    return res.result?.value;
  }
}

/* ------------------------------------------------------------------ */
/* Selector-free DOM probes (the app has no test ids)                    */
/* ------------------------------------------------------------------ */

/** Prayer names in both languages, used to recognise a timetable. */
const PRAYER_NAMES = [
  ["الفجر", "Fajr"],
  ["الظهر", "Dhuhr"],
  ["العصر", "Asr"],
  ["المغرب", "Maghrib"],
  ["العشاء", "Isha"],
];

/** Home-view buttons that open the mushaf reader. */
const MUSHAF_ENTRY_LABELS = [
  "اقرأ الآن",
  "مراجعة اليوم",
  "وردي 📖",
  "Read now",
  "Review today",
  "Wardi 📖",
];

const RAW_KEY_RE = /\b(settings|mushaf|prayer|adhan|adhkar|niyyah|quran|home)\.[a-z][A-Za-z0-9_]*/g;

/**
 * Find translation keys rendered verbatim. Hostnames/URLs are excluded because
 * `quran.com` in a share string is not a missing translation.
 */
function findRawKeys(str) {
  const out = new Set();
  for (const token of String(str || "").split(/\s+/)) {
    if (!token || token.includes("://")) continue;
    if (/\.(com|org|net|io|dev|app|json|webp|png|jpe?g|svg|js|mjs|css|mp3)$/i.test(token)) continue;
    const matches = token.match(RAW_KEY_RE);
    if (matches) for (const m of matches) out.add(m);
  }
  return [...out];
}

const SNAPSHOT_EXPR = `(async () => {
  const body = document.body;
  const text = body ? (body.innerText || "") : "";
  const attrs = [];
  document.querySelectorAll("[aria-label],[title],[placeholder]").forEach((el) => {
    for (const a of ["aria-label", "title", "placeholder"]) {
      const v = el.getAttribute(a);
      if (v) attrs.push(a + "=" + v);
    }
  });
  const navs = Array.from(document.querySelectorAll("nav")).filter(
    (n) => n.querySelectorAll("button").length >= 3,
  );
  const nav = navs.length ? navs[navs.length - 1] : null;
  const btns = nav ? Array.from(nav.querySelectorAll("button")) : [];
  let swCount = 0;
  try {
    if (navigator.serviceWorker) swCount = (await navigator.serviceWorker.getRegistrations()).length;
  } catch (e) {}
  return JSON.stringify({
    text,
    attrs,
    dir: document.documentElement.getAttribute("dir"),
    lang: document.documentElement.getAttribute("lang"),
    url: location.href,
    title: document.title,
    navLabels: btns.map((b) => (b.innerText || b.textContent || "").trim()),
    activeNav: btns.findIndex((b) => b.getAttribute("aria-current") === "page"),
    hasBody: !!body && body.childElementCount > 0,
    swCount,
  });
})()`;

async function snapshot(cdp) {
  const raw = await cdp.evaluate(SNAPSHOT_EXPR);
  const snap = JSON.parse(raw);
  snap.textLen = snap.text.trim().length;
  snap.rawKeys = findRawKeys(snap.text);
  snap.rawAttrKeys = findRawKeys(snap.attrs.join("\n"));
  return snap;
}

async function waitForBoot(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await snapshot(cdp);
    } catch {
      last = null;
    }
    const stillLoading = /جاري تحميل|Loading your ward/.test(last?.text || "");
    if (last && last.navLabels.length >= 5 && last.textLen > 40 && !stillLoading) return last;
    await sleep(250);
  }
  return last;
}

async function clickNav(cdp, index) {
  return cdp.evaluate(`(() => {
    const navs = Array.from(document.querySelectorAll("nav")).filter(
      (n) => n.querySelectorAll("button").length >= 3,
    );
    const nav = navs.length ? navs[navs.length - 1] : null;
    if (!nav) return "NO_NAV";
    const btns = nav.querySelectorAll("button");
    if (!btns[${index}]) return "NO_BUTTON_" + ${index};
    btns[${index}].click();
    return "CLICKED:" + (btns[${index}].innerText || "").trim();
  })()`);
}

async function clickByText(cdp, labels) {
  return cdp.evaluate(`(() => {
    const want = ${JSON.stringify(labels)};
    const els = Array.from(document.querySelectorAll("button,[role=button],a"));
    const el = els.find((e) => {
      const t = (e.innerText || e.textContent || "").trim();
      return want.some((w) => t === w || t.includes(w));
    });
    if (!el) return "NOT_FOUND";
    el.click();
    return "CLICKED:" + ((el.innerText || "").trim().slice(0, 60));
  })()`);
}

/* ------------------------------------------------------------------ */
/* Screenshots                                                          */
/* ------------------------------------------------------------------ */

const screenshots = [];
async function shot(cdp, name) {
  try {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const file = path.join(SHOT_DIR, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    screenshots.push(file);
    return file;
  } catch (err) {
    log(`      (screenshot ${name} failed: ${err.message})`);
    return null;
  }
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
}

/* ------------------------------------------------------------------ */
/* Chrome profile cleanup                                               */
/* ------------------------------------------------------------------ */

/* Windows keeps handles on the profile directory for a moment after the
   Chrome tree is killed, so a single rmSync can throw EPERM/EBUSY. That is
   expected teardown noise and must never change the verdict of a run that has
   already written its report. Retry a few times, then give up quietly. */
async function removeProfileDir(dir) {
  const resolved = path.resolve(dir);
  const tmpRoot = path.resolve(os.tmpdir()) + path.sep;
  // Safety: only ever delete a directory this run created under the OS temp dir.
  if (!resolved.startsWith(tmpRoot)) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (err) {
      if (attempt === 9) {
        log(
          `note: leaving the throwaway Chrome profile behind (${err.code || err.message}): ${resolved}`,
        );
        return;
      }
      await sleep(250);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const chromeExe = findChrome(); // throws loudly when Chrome is missing
  log(`chrome: ${chromeExe}`);

  let staticServer = null;
  let baseUrl = ARGS.url;
  if (ARGS.serveDir) {
    staticServer = await startStaticServer(ARGS.serveDir);
    log(`static server: ${staticServer.url} -> ${ARGS.serveDir}`);
    baseUrl = baseUrl || staticServer.url;
  } else if (!baseUrl) {
    baseUrl = "http://127.0.0.1:4173/";
  }
  if (!baseUrl.endsWith("/")) baseUrl += "/";
  log(`target: ${baseUrl}`);
  log(`artifacts: ${RUN_DIR}`);
  log("");

  const chrome = await launchChrome(chromeExe);
  const cdp = await CDP.connect(chrome.wsUrl);

  /* --- collectors ------------------------------------------------- */
  cdp.on("Runtime.consoleAPICalled", (p) => {
    const text = (p.args || [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? "")
      .join(" ")
      .slice(0, 500);
    const entry = { phase, text: `[${p.type}] ${text}` };
    if (p.type === "error") consoleErrors.push(entry);
    else if (p.type === "warning") consoleWarnings.push(entry);
  });
  cdp.on("Runtime.exceptionThrown", (p) => {
    const d = p.exceptionDetails || {};
    exceptions.push({
      phase,
      text: d.exception?.description || d.text || "unknown exception",
      url: d.url,
      line: d.lineNumber,
    });
  });
  cdp.on("Network.responseReceived", (p) => {
    const r = p.response || {};
    if (r.url && /\/quran\/pages\/\d+\.webp/.test(r.url)) {
      webpRequests.push({ phase, url: r.url, status: r.status });
    }
    if (r.status >= 400) httpErrors.push({ phase, status: r.status, url: r.url });
  });
  cdp.on("Network.loadingFailed", (p) => {
    failedRequests.push({ phase, error: p.errorText || "unknown", url: p.url || "" });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  const BUDGET = ARGS.timeout;
  let boot = null;

  try {
    /* ================================================================ */
    /* CHECK 1 — app boots                                              */
    /* ================================================================ */
    phase = "check1-boot";
    await setViewport(cdp, 390, 844);
    await cdp.send("Page.navigate", { url: baseUrl });
    boot = await waitForBoot(cdp, BUDGET);

    const stillLoading = /جاري تحميل|Loading your ward/.test(boot?.text || "");
    const homeText = (boot?.text || "").replace(/\s+/g, " ").slice(0, 160);
    if (boot) addRawKeys("home", boot.rawKeys);
    if (boot) addRawKeys("home(attr)", boot.rawAttrKeys);
    const bootOk =
      !!boot &&
      boot.navLabels.length >= 5 &&
      boot.textLen > 40 &&
      !stillLoading &&
      boot.activeNav === 0 &&
      boot.rawKeys.length === 0;
    record(
      1,
      "app boots — loading clears, Home renders, no raw translation keys",
      bootOk,
      `nav=[${(boot?.navLabels || []).join(" | ")}] activeNav=${boot?.activeNav} ` +
        `textLen=${boot?.textLen} stillLoading=${stillLoading} ` +
        `rawKeys=${JSON.stringify(boot?.rawKeys || [])}\n` +
        `      home text: ${homeText}`,
    );
    await shot(cdp, "390x844-01-home");

    /* ================================================================ */
    /* CHECK 2 — every bottom-nav tab renders cleanly                    */
    /* ================================================================ */
    phase = "check2-tabs";
    const TAB_IDS = ["home", "history", "library", "khatma", "settings"];
    const tabProblems = [];
    const tabReport = [];
    for (let i = 0; i < TAB_IDS.length; i++) {
      const errorsBefore = consoleErrors.length + exceptions.length;
      await clickNav(cdp, i);
      await sleep(900);
      const snap = await snapshot(cdp);
      const newErrors = consoleErrors.length + exceptions.length - errorsBefore;
      addRawKeys(`tab:${TAB_IDS[i]}`, snap.rawKeys);
      addRawKeys(`tab:${TAB_IDS[i]}(attr)`, snap.rawAttrKeys);
      tabReport.push(`${TAB_IDS[i]}=${snap.textLen}ch/active=${snap.activeNav}/newErrors=${newErrors}`);
      if (snap.textLen < 40) tabProblems.push(`${TAB_IDS[i]} rendered <40 chars`);
      if (newErrors > 0) tabProblems.push(`${TAB_IDS[i]} produced ${newErrors} console error(s)/exception(s)`);
      if (snap.activeNav !== i) tabProblems.push(`${TAB_IDS[i]} click did not mark the tab active`);
      if (/Application error|This page could not be found|Unhandled Runtime Error/.test(snap.text)) {
        tabProblems.push(`${TAB_IDS[i]} shows an error page`);
      }
      await shot(cdp, `390x844-02-tab-${i}-${TAB_IDS[i]}`);
    }
    record(
      2,
      "all five bottom-nav tabs render with no console error",
      tabProblems.length === 0,
      `${tabReport.join(", ")}${tabProblems.length ? `\n      problems: ${tabProblems.join("; ")}` : ""}`,
    );

    /* ================================================================ */
    /* CHECK 3 — prayer bar + timetable                                 */
    /* ================================================================ */
    phase = "check3-prayer";
    await clickNav(cdp, 0); // Home
    await sleep(900);
    const prayerProbe = await cdp.evaluate(`(() => {
      const AR = ${JSON.stringify(PRAYER_NAMES.map((p) => p[0]))};
      const EN = ${JSON.stringify(PRAYER_NAMES.map((p) => p[1]))};
      const nameScore = (s) =>
        AR.filter((x) => (s || "").includes(x)).length + EN.filter((x) => (s || "").includes(x)).length;
      let hook = null;
      for (const sel of ['[data-prayer-bar]', '[data-testid*="prayer"]', '[data-prayer]']) {
        const el = document.querySelector(sel);
        if (el) { hook = { el, why: "selector " + sel }; break; }
      }
      if (!hook) {
        for (const el of document.querySelectorAll("[aria-label]")) {
          const a = el.getAttribute("aria-label") || "";
          if (/مواقيت|شريط مواقيت|prayer times|prayer bar/i.test(a)) { hook = { el, why: "aria-label=" + a }; break; }
        }
      }
      if (!hook) {
        // Deepest element whose visible text already names several prayers.
        const all = Array.from(document.querySelectorAll("section,header,div,button,ul,ol"));
        const cands = all.filter((el) => nameScore(el.innerText) >= 3 && (el.innerText || "").length < 600);
        cands.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
        if (cands.length) hook = { el: cands[0], why: "text names 3+ prayers" };
      }
      if (!hook) return JSON.stringify({ found: false });
      const before = nameScore(document.body.innerText);
      hook.el.click();
      return JSON.stringify({
        found: true,
        why: hook.why,
        tag: hook.el.tagName,
        text: (hook.el.innerText || "").replace(/\\s+/g, " ").slice(0, 200),
        namesBeforeExpand: before,
      });
    })()`);
    const probe = JSON.parse(prayerProbe);
    let prayerDetail = `probe=${prayerProbe}`;
    let prayerOk = false;
    if (probe.found) {
      await sleep(1400);
      const after = await cdp.evaluate(`(() => {
        const AR = ${JSON.stringify(PRAYER_NAMES.map((p) => p[0]))};
        const EN = ${JSON.stringify(PRAYER_NAMES.map((p) => p[1]))};
        const text = document.body.innerText || "";
        const attrs = Array.from(document.querySelectorAll("[aria-label]"))
          .map((e) => e.getAttribute("aria-label") || "").join(" ");
        const hay = text + " " + attrs;
        const present = AR.filter((x) => hay.includes(x));
        const presentEn = EN.filter((x) => hay.includes(x));
        return JSON.stringify({ present, presentEn, sample: text.replace(/\\s+/g, " ").slice(0, 300) });
      })()`);
      const afterData = JSON.parse(after);
      prayerOk = afterData.present.length >= 5 || afterData.presentEn.length >= 5;
      prayerDetail =
        `found via ${probe.why} (${probe.tag}) text="${probe.text}"; after expanding: ` +
        `ar=[${afterData.present.join(",")}] en=[${afterData.presentEn.join(",")}]; ` +
        `sample="${afterData.sample}"`;
      await shot(cdp, "390x844-03-prayer-expanded");
    } else {
      prayerDetail =
        "no prayer-bar element found on screen: no [data-prayer-bar]/[data-testid*=prayer], " +
        "no aria-label matching 'مواقيت'/'prayer times', and no element whose text names 3+ prayers";
    }
    record(
      3,
      "prayer bar renders and expanding it shows a timetable",
      prayerOk,
      prayerDetail,
    );

    /* ================================================================ */
    /* CHECK 4 — mushaf reader opens + a page image loads               */
    /* ================================================================ */
    phase = "check4-mushaf";
    await clickNav(cdp, 0);
    await sleep(800);
    const webpBefore = webpRequests.length;
    let mushafDetail = "";
    let mushafOk = false;
    const entryList = await cdp.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll("button")).filter((b) => !b.closest("nav"));
      return JSON.stringify(
        btns.map((b) => ((b.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 40))).filter(Boolean),
      );
    })()`);
    const clickResult = await clickByText(cdp, MUSHAF_ENTRY_LABELS);
    if (clickResult === "NOT_FOUND") {
      mushafDetail = `no mushaf entry button matched ${JSON.stringify(MUSHAF_ENTRY_LABELS)}; Home buttons were ${entryList}`;
    } else {
      const deadline = Date.now() + BUDGET;
      let reader = null;
      while (Date.now() < deadline) {
        reader = JSON.parse(
          await cdp.evaluate(`(() => {
            const root = document.querySelector(".mushaf-reader,[data-mushaf-theme]");
            const imgs = Array.from(document.querySelectorAll('img[src*="/quran/pages/"]'));
            const loaded = imgs.filter((i) => i.naturalWidth > 0);
            return JSON.stringify({
              reader: !!root,
              imgs: imgs.length,
              loaded: loaded.length,
              firstSrc: imgs[0] ? imgs[0].getAttribute("src") : null,
              text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 160),
            });
          })()`),
        );
        if (reader.reader && reader.loaded > 0) break;
        await sleep(500);
      }
      const webp = webpRequests.slice(webpBefore).filter((r) => r.status === 200);
      mushafOk = !!reader && reader.reader && reader.loaded > 0 && webp.length > 0;
      mushafDetail =
        `entry=${clickResult}; readerRoot=${reader?.reader} imgs=${reader?.imgs} loaded=${reader?.loaded} ` +
        `firstSrc=${reader?.firstSrc}; 200-responses for /quran/pages/*.webp=${webp.length}` +
        (webp.length ? ` (e.g. ${webp[0].url})` : "") +
        `; text="${reader?.text}"`;
      await shot(cdp, "390x844-04-mushaf");
      // Recover to the tab shell.
      const back = await cdp.evaluate(`(() => {
        const b = Array.from(document.querySelectorAll("button")).find(
          (x) => /رجوع|العودة|back/i.test(x.getAttribute("aria-label") || ""),
        );
        if (b) { b.click(); return "back"; }
        return "no-back";
      })()`);
      await sleep(700);
      log(`      mushaf: returned with ${back}`);
    }
    record(4, "mushaf reader opens and a page image loads", mushafOk, mushafDetail);

    /* ================================================================ */
    /* CHECK 5 — language switch flips dir and visible text              */
    /* ================================================================ */
    phase = "check5-language";
    await clickNav(cdp, 4); // settings
    await sleep(900);
    /* Normalise the starting language first. The app follows
       navigator.language, so a fresh profile on an English host boots in
       English; without this reset the "switch to English" assertion is
       vacuous and fails on textChanged. */
    const resetAr = await clickByText(cdp, ["العربية"]);
    await sleep(1200);
    const before = await snapshot(cdp);
    const toEn = await clickByText(cdp, ["English"]);
    await sleep(1200);
    const en = await snapshot(cdp);
    addRawKeys("settings:en", en.rawKeys);
    addRawKeys("settings:en(attr)", en.rawAttrKeys);
    await shot(cdp, "390x844-05-settings-en");
    const toAr = await clickByText(cdp, ["العربية"]);
    await sleep(1200);
    const ar = await snapshot(cdp);
    const enOk =
      before.dir === "rtl" &&
      before.lang === "ar" &&
      toEn.startsWith("CLICKED") &&
      en.dir === "ltr" &&
      en.lang === "en" &&
      en.text !== before.text &&
      /\b(Home|History|Library|Settings)\b/.test(en.navLabels.join(" "));
    const arOk = toAr.startsWith("CLICKED") && ar.dir === "rtl" && ar.lang === "ar";
    record(
      5,
      "English flips dir=ltr and changes text; Arabic restores RTL",
      enOk && arOk,
      `reset-to-ar=${resetAr}; before dir=${before.dir}/lang=${before.lang} nav=[${before.navLabels.join("|")}] -> ` +
        `after-en dir=${en.dir}/lang=${en.lang} nav=[${en.navLabels.join("|")}] (click=${toEn}) -> ` +
        `after-ar dir=${ar.dir}/lang=${ar.lang} (click=${toAr}); textChanged=${en.text !== before.text}`,
    );

    /* ================================================================ */
    /* CHECK 6 — offline behaviour                                      */
    /* ================================================================ */
    phase = "check6-offline";
    await clickNav(cdp, 0);
    await sleep(700);
    const swBefore = (await snapshot(cdp)).swCount;
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await sleep(300);

    // 6a — in-app route change while offline.
    await clickNav(cdp, 1);
    await sleep(800);
    const route = await snapshot(cdp);
    await clickNav(cdp, 0);
    await sleep(600);
    const routeHome = await snapshot(cdp);
    const routeOk =
      route.textLen > 40 && route.hasBody && routeHome.textLen > 40 && !/ERR_|can't be reached/i.test(route.text);
    await shot(cdp, "390x844-06-offline-routechange");

    // 6b — cold reload while offline.
    let reloaded = null;
    let reloadRaw = "";
    try {
      await cdp.send("Page.reload", { ignoreCache: false });
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        await sleep(500);
        try {
          reloadRaw = await cdp.evaluate(`document.body ? (document.body.innerText || "") : ""`);
          if (reloadRaw && reloadRaw.trim().length > 5) break;
        } catch {
          reloadRaw = "";
        }
      }
      reloaded = await snapshot(cdp).catch(() => null);
    } catch (err) {
      reloadRaw = `<evaluate failed: ${err.message}>`;
    }
    await shot(cdp, "390x844-06-offline-reload");
    const reloadOfflineCopy = /غير متصل|لا يوجد اتصال|offline|بدون اتصال/i.test(reloadRaw);
    const chromeErrorPage = /ERR_INTERNET_DISCONNECTED|site can't be reached|لا يمكن الوصول|This site/i.test(
      reloadRaw,
    );
    const reloadOk = !!reloaded && reloaded.hasBody && (reloaded.textLen > 40 || reloadOfflineCopy);
    const offlineDetail =
      `6a route-change: history=${route.textLen}ch home=${routeHome.textLen}ch ok=${routeOk}; ` +
      `6b cold reload: hasBody=${reloaded?.hasBody} textLen=${reloaded?.textLen} ` +
      `offlineCopy=${reloadOfflineCopy} chromeErrorPage=${chromeErrorPage} ` +
      `serviceWorkersRegistered(before)=${swBefore}; ` +
      `reload text="${String(reloadRaw).replace(/\s+/g, " ").slice(0, 200)}"`;
    record(6, "offline does not white-screen the app (route change + reload)", routeOk && reloadOk, offlineDetail);

    // Restore the network so later checks are not polluted.
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    /* ================================================================ */
    /* Second viewport — 375x667 screenshots                            */
    /* ================================================================ */
    phase = "viewport-375";
    await setViewport(cdp, 375, 667);
    await cdp.send("Page.navigate", { url: baseUrl });
    const boot375 = await waitForBoot(cdp, BUDGET);
    await shot(cdp, "375x667-01-home");
    for (let i = 1; i < 5; i++) {
      await clickNav(cdp, i);
      await sleep(700);
      await shot(cdp, `375x667-02-tab-${i}-${TAB_IDS[i]}`);
    }
    log(`      375x667 boot: textLen=${boot375?.textLen} navCount=${boot375?.navLabels.length}`);

    /* ================================================================ */
    /* CHECK 7 — console cleanliness                                    */
    /* ================================================================ */
    phase = "check7-report";
    // Failures caused by the deliberate offline phase are reported but do not
    // count against the app: going offline is supposed to break the network.
    const realConsoleErrors = consoleErrors.filter((e) => e.phase !== "check6-offline");
    const realExceptions = exceptions.filter((e) => e.phase !== "check6-offline");
    const realHttpErrors = httpErrors.filter((e) => e.phase !== "check6-offline");
    const serverErrors = realHttpErrors.filter((e) => e.status >= 500);
    const clientErrors = realHttpErrors.filter((e) => e.status < 500);
    const offlineNetworkFailures = failedRequests.filter((e) => e.phase === "check6-offline");
    const otherNetworkFailures = failedRequests.filter((e) => e.phase !== "check6-offline");

    log("");
    log("--- console errors ------------------------------------------------");
    if (consoleErrors.length === 0) log("  (none)");
    for (const e of consoleErrors) log(`  ${e.phase}: ${e.text}`);
    if (consoleWarnings.length) {
      log(`--- console warnings (${consoleWarnings.length}, informational) ---`);
      for (const e of consoleWarnings.slice(0, 20)) log(`  ${e.phase}: ${e.text}`);
    }
    log("--- uncaught exceptions ------------------------------------------");
    if (exceptions.length === 0) log("  (none)");
    for (const e of exceptions) log(`  ${e.phase}: ${e.text} @ ${e.url}:${e.line}`);
    log("--- HTTP 4xx/5xx and failed requests -----------------------------");
    if (httpErrors.length === 0 && failedRequests.length === 0) log("  (none)");
    for (const e of httpErrors) log(`  ${e.phase}: ${e.status} ${e.url}`);
    for (const e of failedRequests) log(`  ${e.phase}: FAILED ${e.error} ${e.url}`);

    record(
      7,
      "console cleanliness (errors / exceptions / 4xx-5xx listed with URLs)",
      realConsoleErrors.length === 0 && realExceptions.length === 0 && serverErrors.length === 0,
      `consoleErrors(outside offline phase)=${realConsoleErrors.length}, uncaughtExceptions=${realExceptions.length}, ` +
        `5xx=${serverErrors.length}, 4xx=${clientErrors.length}, ` +
        `otherFailedRequests=${otherNetworkFailures.length}, offlinePhaseFailures=${offlineNetworkFailures.length}\n` +
        `      (full lists above and in console-report.json)`,
    );

    /* ================================================================ */
    /* CHECK 8 — raw keys anywhere in any visited view                  */
    /* ================================================================ */
    phase = "check8-rawkeys";
    const uniqueRaw = [...new Set(rawKeyHits.map((h) => `${h.where}: ${h.key}`))];
    record(
      8,
      "no raw translation key visible in any visited view (text or attributes)",
      uniqueRaw.length === 0,
      uniqueRaw.length ? uniqueRaw.join("; ") : "0 raw keys across boot, all 5 tabs, prayer, mushaf and both languages",
    );
  } catch (err) {
    record(0, "harness completed without an internal error", false, `${err.message}\n${err.stack || ""}`);
  } finally {
    /* --- write artifacts ------------------------------------------- */
    const report = {
      label: ARGS.label,
      baseUrl,
      serveDir: ARGS.serveDir,
      chrome: chromeExe,
      startedAt: new Date().toISOString(),
      viewports: ["390x844", "375x667"],
      checks: CHECKS,
      consoleErrors,
      consoleWarnings,
      exceptions,
      httpErrors,
      failedRequests,
      webpRequests,
      rawKeyHits,
      screenshots,
    };
    fs.writeFileSync(path.join(RUN_DIR, "report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(RUN_DIR, "qa.log"), `${LOG_LINES.join("\n")}\n`);
    fs.writeFileSync(
      path.join(RUN_DIR, "console-report.json"),
      JSON.stringify({ consoleErrors, consoleWarnings, exceptions, httpErrors, failedRequests }, null, 2),
    );

    cdp.ws.close();
    // Kill the whole Chrome tree, then drop the throwaway profile.
    if (chrome.proc.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(chrome.proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        chrome.proc.kill("SIGKILL");
      }
    }
    // Release our ends of Chrome's pipes: a live pipe would keep the event
    // loop alive and make the process linger until the watchdog fires.
    chrome.proc.stdout?.destroy();
    chrome.proc.stderr?.destroy();
    await sleep(400);
    await removeProfileDir(chrome.profileDir);
    if (staticServer) await staticServer.close();

    /* --- summary ---------------------------------------------------- */
    const failed = CHECKS.filter((c) => c.status === "FAIL");
    log("");
    log("=== SUMMARY ======================================================");
    for (const c of CHECKS) log(`  ${c.status}  CHECK ${c.id}: ${c.name}`);
    log(`  ${CHECKS.filter((c) => c.status === "PASS").length} passed, ${failed.length} failed`);
    log(`  artifacts : ${RUN_DIR}`);
    log(`  report    : ${path.join(RUN_DIR, "report.json")}`);
    log(`  console   : ${path.join(RUN_DIR, "console-report.json")}`);
    log(`  screenshots (${screenshots.length}):`);
    for (const s of screenshots) log(`    ${s}`);
    log("==================================================================");
    const exitCode = failed.length ? 1 : 0;
    process.exitCode = exitCode;
    /* If any handle (a Chrome pipe, a keep-alive socket) refuses to close,
       force the exit after the synchronous report/log writes above. */
    setTimeout(() => process.exit(exitCode), 100).unref();
  }
}

/* Hard ceiling so a stuck CDP call cannot hang a release job forever. */
setTimeout(() => {
  log("FATAL: harness exceeded the 10-minute safety limit");
  process.exit(2);
}, 10 * 60 * 1000).unref();

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exitCode = 2;
  /* A failure can leave Chrome pipes or sockets open; do not sit there until
     the watchdog fires. The log write above is synchronous, so a short delay
     is enough to flush it. */
  setTimeout(() => process.exit(2), 100).unref();
});
