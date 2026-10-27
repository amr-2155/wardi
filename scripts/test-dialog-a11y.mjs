#!/usr/bin/env node
/**
 * Dialog accessibility contract.
 *
 * The app has nine dialogs (the shared Sheet plus eight hand-rolled ones in the
 * mushaf reader). They all declare themselves as modals to assistive tech, so
 * the behaviour that declaration promises — Escape dismisses, focus is trapped,
 * focus is restored, the page behind cannot scroll — has to hold, or the
 * declaration is a lie.
 *
 * Static analysis by design, like the rest of this suite: the point is to catch
 * a regression in the source, not to re-implement focus management.
 */
import { readFileSync, existsSync } from "node:fs";
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

const HOOK = "src/hooks/useDialogA11y.ts";
const UI = "src/components/ui.tsx";

/* ---- the hook itself ---- */

check("D1: the a11y hook exists and is a client module", () => {
  assert.ok(existsSync(join(ROOT, HOOK)), `${HOOK} must exist`);
  assert.match(read(HOOK), /^"use client"/m, "must carry the use client directive");
});

check("D2: Escape closes the dialog, and only the topmost one", () => {
  const src = read(HOOK);
  assert.match(src, /"Escape"/, "must handle the Escape key");
  assert.match(
    src,
    /openStack\[openStack\.length\s*-\s*1\]\s*!==\s*panel/,
    "only the innermost dialog may react to one Escape"
  );
});

check("D3: Tab is trapped and wraps in both directions", () => {
  const src = read(HOOK);
  assert.match(src, /"Tab"/, "must handle Tab");
  assert.match(src, /shiftKey\s*&&\s*active\s*===\s*firstEl/, "Shift+Tab from the first element must wrap to the last");
  assert.match(src, /!e\.shiftKey\s*&&\s*active\s*===\s*lastEl/, "Tab from the last element must wrap to the first");
});

check("D4: focus enters on open and returns to the trigger on close", () => {
  const src = read(HOOK);
  assert.match(src, /activeElement/, "must capture the element that had focus before opening");
  assert.match(src, /\.focus\(\{/, "must move focus programmatically");
  assert.match(src, /returnFocusTo/, "must restore focus to the trigger");
  assert.match(src, /isConnected/, "must not focus a trigger that has unmounted");
  assert.match(src, /openStack\.length\s*===\s*0/, "must not steal focus from a dialog still open underneath");
});

check("D5: the page behind cannot scroll, and the lock is released", () => {
  const src = read(HOOK);
  assert.match(src, /body\.style\.overflow\s*=\s*"hidden"/, "must lock body scroll");
  assert.match(src, /prevOverflow/, "must restore the previous overflow value");
  assert.match(src, /paddingInlineEnd/, "must compensate for the removed scrollbar so the page does not shift");
});

check("D6: the trap recovers if focus escapes the panel", () => {
  const src = read(HOOK);
  assert.match(
    src,
    /!panel\.contains\(active\)/,
    "focus landing outside the dialog (a backdrop click) must be pulled back in"
  );
});

check("D7: no ref is written during render", () => {
  const src = read(HOOK);
  assert.ok(
    !/^\s*(?!.*(?:useEffect|=>|\{|\}|\)).)*\w+Ref\.current\s*=/m.test(
      src.replace(/useEffect\([\s\S]*?\);/g, "")
    ),
    "assigning a ref during render trips react-hooks and breaks concurrent rendering"
  );
  assert.match(src, /useEffect\(\(\)\s*=>\s*\{\s*onCloseRef\.current\s*=\s*onClose/, "the close ref must be updated inside an effect");
});

/* ---- the shared Sheet actually uses it ---- */

check("D8: Sheet is wired to the a11y hook", () => {
  const src = read(UI);
  assert.match(src, /useDialogA11y\(/, "Sheet must call the hook");
  assert.match(src, /useDialogA11y\(open,\s*onClose,\s*panelRef\)/, "the hook needs open, onClose and the panel ref");
  assert.match(src, /ref=\{panelRef\}/, "the panel must be the ref target");
});

check("D9: Sheet names its dialog and labels the title", () => {
  const src = read(UI);
  assert.match(src, /role="dialog"/, "must declare the dialog role");
  assert.match(src, /aria-modal="true"/, "must declare the modal state");
  assert.match(src, /aria-labelledby=\{titleId\}/, "must point aria-labelledby at the title");
  assert.match(src, /<h3 id=\{titleId\}/, "the title element must carry that id");
  assert.match(src, /useId\(\)/, "ids must be unique per instance, not hardcoded");
  /* A raw aria-label duplicates the visible heading and is not what
     aria-labelledby replaced. */
  assert.ok(!/aria-label=\{title\}/.test(src), "aria-label={title} must be replaced by aria-labelledby");
});

check("D10: the backdrop is hidden from assistive tech", () => {
  const src = read(UI);
  assert.match(src, /onClick=\{onClose\}[\s\S]{0,80}aria-hidden="true"/, "the dismiss backdrop must be aria-hidden");
});

check("D11: the sheet is scrollable and respects the mobile safe area", () => {
  const src = read(UI);
  assert.match(src, /max-h-\[88dvh\]/, "a tall sheet must be able to scroll");
  assert.match(src, /overscroll-contain/, "scroll chaining must be contained inside the sheet");
  assert.match(src, /safe-area-inset-bottom/, "the sheet must clear the home indicator");
});

/* ---- focus visibility ---- */

check("D12: a global focus-visible ring exists", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /:focus-visible/, "a global focus ring must be defined");
  assert.match(css, /outline-offset/, "the ring needs an offset to clear rounded corners");
  assert.match(
    css,
    /prefers-reduced-motion:reduce/,
    "reduced motion must still be honoured after the ring was added"
  );
  /* :focus would light a ring on every tap on a touch screen. */
  assert.ok(!/:(?!focus-visible)[a-z-]+\s*,\s*[^{]*:focus\{[^}]*outline/.test(css), "must not style bare :focus with an outline");
});

check("D13: the ring adapts to the dark surface", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.dark[^{]*:focus-visible/, "a dark-surface override is required, the ring colour is dark");
  assert.match(css, /--primary-ink/, "the dark ring must use the light primary-ink token");
});

/* ---- guard against a vacuous suite ---- */

check("D14: the source under test was really read", () => {
  assert.ok(read(HOOK).length > 500, "the hook file looks empty");
  assert.ok(read(UI).length > 500, "ui.tsx looks empty");
});

console.log(`\nDialog accessibility: ${passed}/${passed + failed} passed`);
if (failed) {
  console.log(`${failed} failure(s)`);
  process.exit(1);
}