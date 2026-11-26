#!/usr/bin/env node
/**
 * Immersive mushaf reader contract.
 *
 * The reader is the one screen that owns the whole phone screen: the tools are
 * overlays that start hidden, a tap on the page toggles them, five idle seconds
 * hide them again, and only this screen hides the Android system bars. Static
 * analysis by design, like the rest of the suite; the geometry (page identical
 * before/after a toggle, bars never covering a line) was verified in a 390x844
 * emulated viewport and is pinned here by the invariants that make it possible.
 *
 * Honesty rules enforced here:
 * - the tools start hidden and are real overlays, not flow elements
 * - hidden means untouchable and out of the accessibility tree
 * - the bar band is still reserved, so a shown bar cannot cover the page
 * - native bar hiding is Android-only, opt-in, and restored on unmount
 * - no second nav surface (the page pill) competes with the footer
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name}\n      ${err.message.split("\n")[0]}`);
    failed += 1;
  }
}

const READER = "src/components/views/MushafReader.tsx";
const IMMERSIVE = "src/lib/immersive.ts";
const ACTIVITY = "android/app/src/main/java/com/wardi/app/MainActivity.java";

const reader = read(READER);

/* ---- the tools start away and go away on their own ---- */

check("I1: the reader opens with no chrome", () => {
  assert.match(reader, /const \[chrome, setChrome\] = useState\(false\)/, "chrome must start hidden");
});

check("I2: idle chrome auto-hides after five seconds", () => {
  assert.match(reader, /const CHROME_HIDE_MS = 5000/, "auto-hide must be 5000ms");
  assert.match(reader, /setTimeout\(\(\) => \{\s*chromeTimer\.current = null;\s*setChrome\(false\);/s, "the timer must actually hide the tools");
});

check("I3: a tap on the page toggles the tools", () => {
  const body = reader.slice(reader.indexOf("const onSingleTap = useCallback("));
  const fn = body.slice(0, body.indexOf("}, ["));
  assert.match(fn, /if \(chrome\) hideChrome\(\);/, "a tap must close open tools");
  assert.match(fn, /else showChrome\(\);/, "a tap must open closed tools");
});

check("I4: the framed page number stays visible on the reading surface", () => {
  /* The header carries surah + juz/hizb; the printed-mushaf number is a calm
     paper tab at the foot of the page. It no longer disappears with the chrome
     (or reappears as a second floating pill) — there is exactly one mark. */
  assert.match(reader, /\{page !== null && !celebration && \(/,
    "the page number must not depend on the chrome being hidden");
  assert.match(reader, /className="mushaf-page-number /,
    "the page mark must be the styled folio tab");
  const css = read("src/app/globals.css");
  assert.match(css, /\.mushaf-page-number\{/, "the folio tab needs a real style rule");
  assert.doesNotMatch(reader, /\{pill && !chrome/, "no second, competing page pill");
});

/* ---- overlays, not layout ---- */

check("I5: header and footer are absolute overlays above the page", () => {
  assert.match(reader, /className=\{`mushaf-bar mushaf-bar-top mushaf-bar-overlay absolute inset-x-0 top-0 z-30/, "header overlay");
  assert.match(reader, /className=\{`mushaf-bar mushaf-bar-bottom mushaf-bar-overlay absolute inset-x-0 bottom-0 z-30/, "footer overlay");
  assert.doesNotMatch(reader, /mushaf-bar mushaf-bar-(top|bottom)[^`]*relative/, "bars must not sit in the flow");
});

check("I6: hidden tools are untouchable and out of the a11y tree", () => {
  /* The header itself stays live because its centred position pill must always
     be readable. The three pieces that do fade out — back, close and the
     progress/control footer — must each leave both the touch and the a11y
     tree, or a tap on the page could hit an invisible control. */
  const hidden = reader.match(/pointer-events-none[^"`]*opacity-0/g) ?? [];
  assert.ok(hidden.length >= 3, "every fading control needs a hidden state");
  const inert = reader.match(/inert=\{!chrome\}/g) ?? [];
  assert.equal(inert.length, 3, "back, close and footer must be inert while hidden");
  const aria = reader.match(/aria-hidden=\{!chrome\}/g) ?? [];
  assert.equal(aria.length, 3, "back, close and footer must leave the a11y tree while hidden");
});

/* ---- the reserved band: an overlay must never cover a line ---- */

check("I7: the bar band is measured, not hardcoded", () => {
  assert.match(reader, /new ResizeObserver\(apply\)/, "bar heights must be measured");
  assert.match(reader, /"--mushaf-bar-top-h"/, "top band var");
  assert.match(reader, /"--mushaf-bar-bot-h"/, "bottom band var");
  assert.match(reader, /paddingTop: "var\(--mushaf-bar-top-h, 0px\)"/, "main must reserve the top band");
  assert.match(reader, /paddingBottom: "var\(--mushaf-bar-bot-h, 0px\)"/, "main must reserve the bottom band");
  assert.match(reader, /\[celebration\]\)/, "the band must be re-measured when the footer unmounts");
});

check("I8: the band is a blur of the same paper, not an opaque slab", () => {
  const css = read("src/app/globals.css");
  const rule = css.slice(css.indexOf(".mushaf-bar-overlay{"));
  const block = rule.slice(0, rule.indexOf("}"));
  assert.match(block, /backdrop-filter:blur\(/, "the page must stay visible through the bar");
  assert.match(block, /color-mix\(in oklab, var\(--mpaper-top\) 9\d%/, "the bar must be nearly the page paper");
});

check("I17: the reader is a cream page with a quiet app bar", () => {
  const css = read("src/app/globals.css");
  const pill = css.slice(css.indexOf(".mushaf-position-pill{"));
  const block = pill.slice(0, pill.indexOf("}"));
  assert.match(block, /background:transparent/, "the title must sit on the app bar, not in a badge");
  assert.match(block, /border:0/, "the old gold capsule must not come back");
  assert.match(css, /\.mushaf-bar-top\{[^}]*border-bottom:1px solid/,
    "the app bar needs one quiet edge");
  assert.match(css, /\.mushaf-bar-bottom\{[^}]*border-radius:1\.15rem/,
    "the footer must read as a compact dock");
  assert.match(css, /\.mushaf-dock\{[^}]*border-top:1px solid/,
    "the control row must sit under one quiet divider");
  assert.match(css, /\.mushaf-glyphs\{[^}]*box-shadow/,
    "the page must read as a sheet on the surface");
  assert.match(css, /\.mushaf-position-pill > span:last-child\{[^}]*margin-top:0/,
    "the juz/hizb line must sit directly under the title");
  const theme = read("src/lib/quran/readerTheme.ts");
  assert.match(theme, /DEFAULT_MUSHAF_THEME: MushafThemeId = "ivory"/,
    "a new reader must open on the warm paper surface");
});

/* ---- native system bars: this screen only, and restored ---- */

check("I9: the native bridge is Android-only and never throws", () => {
  assert.ok(existsSync(join(ROOT, IMMERSIVE)), `${IMMERSIVE} must exist`);
  const src = read(IMMERSIVE);
  assert.match(src, /Capacitor\.isNativePlatform\(\)/, "must be a no-op on the web");
  assert.match(src, /registerPlugin<SystemBarsPlugin>\("SystemBars"\)/, "must use Capacitor's built-in SystemBars plugin");
  assert.match(src, /if \(!plugin\) return;/, "must no-op without the plugin");
  assert.match(src, /\.catch\(/, "a missing plugin must not throw");
  assert.doesNotMatch(src, /@capacitor\/status-bar/, "no third-party bar plugin");
});

check("I10: the reader hides the bars on mount and restores them on unmount", () => {
  assert.match(reader, /import \{ setImmersive \} from "@\/lib\/immersive"/, "reader must import the bridge");
  const body = reader.slice(reader.indexOf("setImmersive(true);"));
  assert.match(body, /return \(\) => \{[\s\S]{0,200}setImmersive\(false\);/, "unmount must give the bars back");
  assert.match(body, /visibilitychange/, "returning to the app must re-assert the reader state");
});

check("I11: an edge swipe reveals the system bars only transiently", () => {
  const src = read(ACTIVITY);
  assert.match(src, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/, "transient bars behaviour");
  assert.match(src, /WindowCompat\.getInsetsController/, "insets controller");
  assert.match(src, /extends BridgeActivity/, "must stay a Capacitor activity");
  assert.match(src, /super\.onCreate\(savedInstanceState\)/, "must not replace Capacitor's setup");
});

check("I12: the footer is a shallow reading dock, not a second toolbar", () => {
  const footer = reader.slice(reader.indexOf("<footer"), reader.indexOf("</footer>"));
  for (const token of [
    "skipVerse",
    "finishPage",
    "jumpTo",
    "flowDown",
    "flowUp",
    "AUTO_SPEEDS",
  ]) {
    assert.ok(!footer.includes(token), `the footer must not own ${token} any more`);
  }
  assert.match(footer, /PROGRESS \+ WARD RANGE/, "the progress line must stay");
  assert.match(footer, /role="progressbar"/, "progress must still be exposed to a11y");
  assert.doesNotMatch(footer, /<ProgressRing/, "one progress signal is enough in the dock");
  assert.match(footer, /mushaf-dock flex/, "the dock must be one shallow row");
  assert.match(footer, /mushaf\.prevShort/, "page back must be in the dock");
  assert.match(footer, /mushaf\.nextShort/, "page forward must be in the dock");
  assert.match(footer, /handleListen/, "the gold action must start recitation");
  assert.match(footer, /mushaf\.textSize/, "text size must be reachable from the dock");
  assert.match(footer, /toolsTrigger/, "the dock must own the tools trigger");
});

check("I13: the dock owns a dismissible floating tool panel", () => {
  assert.match(reader, /data-tools-fab/, "the dock's tools control must open the panel");
  assert.doesNotMatch(reader, /mushaf-tools-fab/, "no stray FAB outside the dock");
  assert.match(reader, /data-tools-panel/, "the circular tools need one floating panel");
  assert.match(reader, /data-tools-overlay/, "an outside-click layer must close the panel");
  assert.match(reader, /onClick=\{closeTools\}/, "outside click and X must both close");
  assert.match(reader, /aria-label=\{t\("mushaf.tools"\)\}/, "the panel must be named");
  assert.match(reader, /role="dialog"/, "the panel must be a modal dialog");
  /* Every row tool moved here; none may be lost in the redesign. */
  for (const key of [
    "mushaf.textSize",
    "mushaf.tafsir",
    "mushaf.orientation",
    "mushaf.appearance",
    "mushaf.bookmarksShort",
    "mushaf.autoScroll",
    "mushaf.speedShort",
    "mushaf.prevShort",
    "mushaf.nextShort",
    "mushaf.finishShort",
    "mushaf.listen",
    "mushaf.prevAyah",
    "mushaf.nextAyah",
    "mushaf.stopRecite",
    "mushaf.followAudio",
    "mushaf.toolIndex",
    "mushaf.searchShort",
    "mushaf.pageInfoShort",
    "mushaf.wardInfo",
    "mushaf.wardSetup",
    "mushaf.modeShort",
    "mushaf.reportShort",
    "mushaf.flowUp",
    "mushaf.flowDown",
  ]) {
    assert.ok(reader.includes(`t("${key}")`), `the tool panel is missing ${key}`);
  }
});

check("I14: text size has a preview, A-/A/A+ and one owner for fit chips", () => {
  assert.match(reader, /mushaf\.textPreview/, "a paper preview must show the current size");
  assert.match(reader, /A−/, "smaller control");
  assert.match(reader, /A\+/, "larger control");
  assert.match(reader, /stepTextSize\(-1\)/, "smaller must actually change the fit");
  assert.match(reader, /resetTextSize/, "A must reset to the whole page");
  assert.match(reader, /stepTextSize\(1\)/, "larger must actually change the fit");
  const fits = reader.match(/MUSHAF_FITS\.map/g) ?? [];
  assert.equal(fits.length, 1, "fit chips must exist once, not in two sheets");
});

check("I15: exactly four calm auto-scroll speeds survive the redesign", () => {
  const speeds = reader.match(/\{ level: \d, value: [\d.]+ \}/g) ?? [];
  assert.equal(speeds.length, 4, "the four numbered speeds must not become a slider");
  assert.match(reader, /AUTO_SPEEDS\.map/, "the speed sheet must render all four");
});

check("I16: tafsir opens inside the reader and can leave for a full ayah", () => {
  assert.match(reader, /<TadabburSheet[\s\S]{0,240}onOpenAyah=\{handleOpenAyah\}/,
    "the reader must render the grounded reflection sheet");
  assert.match(reader, /onOpenAyah\?\.\(ayahId\)/, "the deep link must be optional");
});

console.log(`\nimmersive: ${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
