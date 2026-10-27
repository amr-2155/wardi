import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Scratch harnesses are the one-off browser/CDP debugging scripts recorded in
 * `.gitignore` under "One-off QA / debug scratch scripts". They are not part of
 * the shipped project, so they are excluded here for the same reason they are
 * excluded from version control -- otherwise they drown the real findings
 * (they accounted for every error in the previous `npm run lint` run).
 *
 * The tracked test/build harnesses in `scripts/` are still linted.
 */
const SCRATCH_SCRIPTS = [
  "scripts/cdp-*.js",
  "scripts/qa-*.js",
  "scripts/qa-*.cjs",
  "scripts/browser-qa.js",
  "scripts/investigate-*.js",
  "scripts/mobile-qa*.js",
  "scripts/headless-qa*.mjs",
  "scripts/headless-test.js",
  "scripts/chrome-debug.js",
  "scripts/check-tabs*.js",
  "scripts/check-pages.js",
  "scripts/verify-api*.js",
  "scripts/verify-api*.mjs",
  "scripts/verify-pattern*.js",
  "scripts/tcp-test.js",
  "scripts/parse-pages.js",
  "scripts/test-null.js",
  "scripts/recover-css.mjs",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendored trees that are never hand-edited here:
    // Capacitor copies the web export into the Android project, and Gradle
    // writes bundled JS chunks under build/. Linting those reports thousands of
    // findings against minified third-party code.
    "android/**/build/**",
    "android/.gradle/**",
    "android/.kotlin/**",
    "android/app/src/main/assets/**",
    "android/app/src/main/res/raw/**",
    ...SCRATCH_SCRIPTS,
  ]),
]);

export default eslintConfig;
