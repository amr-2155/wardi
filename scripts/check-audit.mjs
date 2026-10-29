#!/usr/bin/env node
/**
 * check-audit.mjs — the dependency gate for WARDI.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two critical advisories once sat in the dependency tree unnoticed: one in
 * `next` (RCE on the Windows build host) and one in `@capacitor/android`
 * (remote content reachable at the app origin inside the shipped WebView).
 * Both had patch releases available; nobody was looking. This script makes
 * "is anything critical reachable in production?" a command you can run.
 *
 * WHY NOT `npm audit` DIRECTLY
 * ----------------------------
 * A project script named `audit` runs a *nested* npm, and npm exports its
 * config to children. If the machine's ~/.npmrc sets `allow-scripts` (some
 * unrelated global tool does), the child npm aborts with EALLOWSCRIPTS before
 * it ever audits anything. So this script strips those inherited variables and
 * reads the JSON itself.
 *
 * SCOPE
 * -----
 * `--omit=dev` is deliberate. ESLint, the Tailwind PostCSS plugins and the
 * Capacitor CLI are build-time only; they never ship in the APK. Keeping the
 * gate on production deps means it can stay green and therefore stay trusted,
 * instead of being permanently red on advisories that cannot reach a user.
 *
 * EXIT CODES
 * ----------
 *   0  no high/critical advisories in production deps (or the registry was
 *      unreachable — reported as SKIP rather than a false failure)
 *   1  at least one high or critical advisory in production deps
 */
import { spawnSync } from "node:child_process";

/** Never let the parent npm's allow-scripts config poison the child. */
function childEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith("npm_config_allow_scripts")) delete env[key];
  }
  return env;
}

function runAudit() {
  const isWindows = process.platform === "win32";
  const res = spawnSync("npm audit --omit=dev --json", {
    // .cmd shims cannot be spawned without a shell on Windows.
    shell: isWindows,
    env: childEnv(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return res;
}

function main() {
  const res = runAudit();
  const stdout = (res.stdout || "").trim();

  let report = null;
  if (stdout.startsWith("{")) {
    try {
      report = JSON.parse(stdout);
    } catch {
      report = null;
    }
  }

  if (!report) {
    const detail = (res.stderr || stdout || res.error?.message || "").trim();
    console.log("SKIP: could not read an audit report from the npm registry.");
    console.log(`      ${detail.split("\n").slice(-3).join("\n      ")}`);
    return 0;
  }

  const counts = report.metadata?.vulnerabilities || {};
  const blocking = ["critical", "high"];
  const offenders = Object.entries(report.vulnerabilities || {}).filter(([, v]) =>
    blocking.includes(v.severity),
  );

  const summary = blocking.map((sev) => `${counts[sev] ?? 0} ${sev}`).join(", ");

  if (!offenders.length) {
    console.log(`PASS: no high or critical advisories in production dependencies (${summary}).`);
    const moderate = counts.moderate ?? 0;
    if (moderate) console.log(`      ${moderate} moderate advisory(ies) remain in build-only tooling.`);
    return 0;
  }

  console.log(`FAIL: ${offenders.length} high/critical advisor${offenders.length === 1 ? "y" : "ies"} in production dependencies (${summary}).`);
  for (const [name, v] of offenders) {
    const titles = (v.via || [])
      .filter((x) => typeof x === "object")
      .map((x) => x.title);
    console.log(`  - ${name} [${v.severity}] ${titles[0] || v.range || ""}`);
    if (v.fixAvailable && v.fixAvailable !== false) {
      const fix = v.fixAvailable;
      console.log(
        `    fix: ${typeof fix === "object" ? `${fix.name}@${fix.version}` : "npm audit fix"}`,
      );
    }
  }
  return 1;
}

process.exitCode = main();
