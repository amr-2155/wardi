/**
 * Reminder regression harness: White Days dates, the 10-minute lead, numeric
 * input editing and settings migration.
 *
 * Same pattern as the other harnesses: compile the REAL modules with the
 * project's tsc into node_modules/.cache and import them. Nothing here
 * re-implements app logic, so a pass means the shipped code behaves.
 *
 * No device is touched. Alarm delivery is device-dependent and is reported as
 * such in the UI; this file verifies the dates and decisions that drive it.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "reminders-test");

rmSync(OUT, { recursive: true, force: true });

const libFiles = [
  join(ROOT, "src", "lib", "reminderTime.ts"),
  join(ROOT, "src", "lib", "hijri.ts"),
  join(ROOT, "src", "lib", "whiteDays.ts"),
  join(ROOT, "src", "lib", "numericInput.ts"),
  join(ROOT, "src", "lib", "prayer.ts"),
  join(ROOT, "src", "lib", "prayerSettings.ts"),
];

execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    ...libFiles,
    "--outDir", OUT,
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--target", "es2019",
    /* `whiteDays.ts` formats day lists with `Intl.ListFormat` (ES2021). The
       app's own tsconfig gets that from `lib: ["dom", "dom.iterable",
       "esnext"]`; this standalone compile needs the same libs or it fails on
       a type that exists at runtime in Node. */
    "--lib", "es2021,dom",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const load = (name) => import(pathToFileURL(join(OUT, name)).href);

const {
  parseReminderTime,
  nextReminderAt,
  minutesBefore,
} = await load("reminderTime.js");
const { hijriOf } = await load("hijri.js");
const { upcomingWhiteDays, gregorianDayLabel, hijriMonthLabel } = await load("whiteDays.js");
const {
  parseNumberDraft,
  commitNumberDraft,
  resolveNumberDraft,
  isInRange,
} = await load("numericInput.js");
const { sanitizePrayerSettings, DEFAULT_PRAYER_SETTINGS } = await load("prayerSettings.js");

let passed = 0;
const total = [];
const check = (name, fn) => total.push({ name, fn });

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ------------------------------------------------------------------ */
/* Hijri conversion                                                    */
/* ------------------------------------------------------------------ */

check("hijri: 23 Nov 2026 is 13 Jumada al-Akhirah 1448", () => {
  const h = hijriOf(at(2026, 11, 23));
  assert.equal(h.year, 1448);
  assert.equal(h.month, 6);
  assert.equal(h.day, 13);
});

check("hijri: the offset moves the converted day by exactly one", () => {
  const base = hijriOf(at(2026, 11, 23));
  const plus = hijriOf(at(2026, 11, 23), 1);
  const minus = hijriOf(at(2026, 11, 23), -1);
  assert.equal(plus.day, base.day + 1);
  assert.equal(minus.day, base.day - 1);
});

/* ------------------------------------------------------------------ */
/* White Days                                                          */
/* ------------------------------------------------------------------ */

const NOW = at(2026, 10, 30, 9);

check("white days: two reminders, on the 11th and 12th at 20:00", () => {
  const list = upcomingWhiteDays(NOW, { time: "20:00" });
  assert.equal(list.length >= 2, true);
  const [two, one] = list;
  assert.equal(two.kind, "twoDaysBefore");
  assert.equal(one.kind, "oneDayBefore");
  assert.equal(iso(two.notifyAt), "2026-11-21");
  assert.equal(two.notifyAt.getHours(), 20);
  assert.equal(two.notifyAt.getMinutes(), 0);
  assert.equal(iso(one.notifyAt), "2026-11-22");
});

check("white days: every reminder names 13, 14 and 15 and their dates", () => {
  const list = upcomingWhiteDays(NOW);
  for (const reminder of list.slice(0, 2)) {
    assert.deepEqual(reminder.fastDays.map((d) => d.day), [13, 14, 15]);
    assert.deepEqual(
      reminder.fastDays.map((d) => iso(d.date)),
      ["2026-11-23", "2026-11-24", "2026-11-25"]
    );
    assert.equal(reminder.hijriMonth, 6);
    assert.equal(reminder.hijriYear, 1448);
  }
});

check("white days: no reminder is ever returned in the past", () => {
  const late = at(2026, 11, 23, 21); // 13th, after both slots passed
  const list = upcomingWhiteDays(late);
  for (const reminder of list) {
    assert.ok(reminder.notifyAt.getTime() > late.getTime(), `${reminder.key} is in the past`);
  }
  // The next month's window must still be found.
  assert.equal(list.some((r) => r.fastDays[0].date.getMonth() === 11), true);
});

check("white days: the 11th reminder is dropped once its time passes, not the 12th", () => {
  const middayOn11 = at(2026, 11, 21, 23);
  const list = upcomingWhiteDays(middayOn11, { time: "20:00" });
  assert.equal(list[0].kind, "oneDayBefore");
  assert.equal(iso(list[0].notifyAt), "2026-11-22");
});

check("white days: custom reminder time is honoured", () => {
  const list = upcomingWhiteDays(NOW, { time: "06:30" });
  assert.equal(list[0].notifyAt.getHours(), 6);
  assert.equal(list[0].notifyAt.getMinutes(), 30);
});

check("white days: an invalid time falls back to 20:00", () => {
  const list = upcomingWhiteDays(NOW, { time: "99:99" });
  assert.equal(list[0].notifyAt.getHours(), 20);
});

check("white days: +1 offset advances the Hijri date by a day (fasts one day earlier)", () => {
  const base = upcomingWhiteDays(NOW)[0].fastDays.map((d) => iso(d.date));
  const plus = upcomingWhiteDays(NOW, { offsetDays: 1 })[0].fastDays.map((d) => iso(d.date));
  assert.deepEqual(plus, ["2026-11-22", "2026-11-23", "2026-11-24"]);
  assert.notDeepEqual(plus, base);
  const minus = upcomingWhiteDays(NOW, { offsetDays: -1 })[0].fastDays.map((d) => iso(d.date));
  assert.deepEqual(minus, ["2026-11-24", "2026-11-25", "2026-11-26"]);
});

check("white days: offset is clamped to -2…+2", () => {
  const far = upcomingWhiteDays(NOW, { offsetDays: 99 })[0];
  const two = upcomingWhiteDays(NOW, { offsetDays: 2 })[0];
  assert.equal(iso(far.fastDays[0].date), iso(two.fastDays[0].date));
});

check("white days: a full year yields two reminders per month, all 13/14/15", () => {
  const list = upcomingWhiteDays(NOW, { horizonDays: 400 });
  assert.ok(list.length >= 24, `expected at least 24 reminders, got ${list.length}`);
  const keys = list.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate reminder keys");
  for (const reminder of list) {
    assert.deepEqual(reminder.fastDays.map((d) => d.day), [13, 14, 15]);
    // Three consecutive local days.
    for (let i = 1; i < 3; i += 1) {
      const diff = reminder.fastDays[i].date.getTime() - reminder.fastDays[i - 1].date.getTime();
      assert.equal(Math.round(diff / 86_400_000), 1, "fast days are not consecutive");
    }
    const month = reminder.fastDays[0].date.getMonth();
    assert.equal(reminder.fastDays.every((d) => d.date.getMonth() === month), true);
  }
});

check("white days: the fast-day count per month is exactly two reminders", () => {
  const list = upcomingWhiteDays(NOW, { horizonDays: 400 });
  const perMonth = new Map();
  for (const reminder of list) {
    const key = `${reminder.hijriYear}-${reminder.hijriMonth}`;
    perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
  }
  for (const [key, count] of perMonth) {
    assert.equal(count, 2, `${key} has ${count} reminders`);
  }
});

check("white days: locale labels render without throwing", () => {
  const reminder = upcomingWhiteDays(NOW)[0];
  assert.ok(hijriMonthLabel(reminder.fastDays[0].date, "ar").length > 0);
  assert.ok(hijriMonthLabel(reminder.fastDays[0].date, "en").length > 0);
  assert.ok(gregorianDayLabel(reminder.fastDays[0].date, "ar").length > 0);
  assert.ok(gregorianDayLabel(reminder.fastDays[0].date, "en").length > 0);
});

/* ------------------------------------------------------------------ */
/* 10 minutes before the prayer                                        */
/* ------------------------------------------------------------------ */

check("lead: 10 minutes before Asr is exactly 600000 ms earlier", () => {
  const asr = at(2026, 10, 30, 15, 42, 0);
  const lead = minutesBefore(asr, 10);
  assert.equal(asr.getTime() - lead.getTime(), 10 * 60 * 1000);
  assert.equal(lead.getHours(), 15);
  assert.equal(lead.getMinutes(), 32);
});

check("lead: crossing the hour boundary stays on the same day", () => {
  const fajr = at(2026, 10, 30, 4, 5);
  const lead = minutesBefore(fajr, 10);
  assert.equal(iso(lead), "2026-10-30");
  assert.equal(lead.getHours(), 3);
  assert.equal(lead.getMinutes(), 55);
});

check("lead: negative or NaN minutes never move the reminder later", () => {
  const t = at(2026, 10, 30, 12, 0);
  assert.equal(minutesBefore(t, -10).getTime(), t.getTime());
  assert.equal(minutesBefore(t, Number.NaN).getTime(), t.getTime());
});

check("lead: each of the five prayers gets its own reminder", () => {
  const times = {
    fajr: at(2026, 10, 30, 4, 30),
    dhuhr: at(2026, 10, 30, 12, 0),
    asr: at(2026, 10, 30, 15, 30),
    maghrib: at(2026, 10, 30, 18, 0),
    isha: at(2026, 10, 30, 19, 30),
  };
  const leads = Object.values(times).map((t) => minutesBefore(t, 10).getTime());
  assert.equal(new Set(leads).size, 5);
});

/* ------------------------------------------------------------------ */
/* Numeric input: clear, type, commit, validate                        */
/* ------------------------------------------------------------------ */

check("numbers: an empty box parses to nothing (clearing is allowed)", () => {
  assert.equal(parseNumberDraft(""), null);
  assert.equal(parseNumberDraft("   "), null);
  assert.equal(parseNumberDraft("-"), null);
});

check("numbers: digits parse, junk does not", () => {
  assert.equal(parseNumberDraft("15"), 15);
  assert.equal(parseNumberDraft(" 7 "), 7);
  assert.equal(parseNumberDraft("1.5"), null);
  assert.equal(parseNumberDraft("abc"), null);
});

check("numbers: incomplete or out-of-range drafts do not overwrite the old value", () => {
  assert.equal(commitNumberDraft("", { min: 1 }), undefined);
  assert.equal(commitNumberDraft("0", { min: 1 }), undefined);
  assert.equal(commitNumberDraft("121", { min: 1, max: 120 }), undefined);
  assert.equal(commitNumberDraft("10", { min: 1, max: 120 }), 10);
});

check("numbers: clearing then typing 15 commits 15 (the old bug committed 1)", () => {
  const bounds = { min: 1, max: 120 };
  let value = 10;
  let draft = String(value);
  // clear
  draft = "";
  const cleared = commitNumberDraft(draft, bounds);
  if (cleared !== undefined) value = cleared;
  assert.equal(value, 10, "clearing must not force min into the value");
  // type "1", then "15"
  draft = "1";
  const one = commitNumberDraft(draft, bounds);
  if (one !== undefined) value = one;
  assert.equal(value, 1);
  draft = "15";
  const fifteen = commitNumberDraft(draft, bounds);
  if (fifteen !== undefined) value = fifteen;
  assert.equal(value, 15);
});

check("numbers: blur clamps and falls back instead of producing NaN", () => {
  assert.equal(resolveNumberDraft("", { min: 1 }, 10), 10);
  assert.equal(resolveNumberDraft("0", { min: 1 }, 10), 1);
  assert.equal(resolveNumberDraft("999", { min: 1, max: 120 }, 10), 120);
  assert.equal(resolveNumberDraft("abc", { min: 1 }, 10), 10);
});

check("numbers: decimals are accepted only where the field allows them", () => {
  // Coordinates are the reason this exists: rejecting "24.7" made the whole
  // latitude/longitude pair impossible to type by hand.
  assert.equal(parseNumberDraft("24.7136", 4), 24.7136);
  assert.equal(parseNumberDraft("24.", 4), 24, "a half-typed trailing dot is a draft, not an error");
  assert.equal(parseNumberDraft("-46.6", 4), -46.6);
  assert.equal(commitNumberDraft("24.71366", { min: -90, max: 90 }, 4), 24.7137);
  assert.equal(commitNumberDraft("1.5", { min: 1, max: 3 }, 0), undefined, "integer fields must not round silently");
  assert.equal(resolveNumberDraft("12.345678", { min: -90, max: 90 }, 0, 4), 12.3457);
});

check("numbers: range check excludes the bounds' outside", () => {
  assert.equal(isInRange(10, { min: 1, max: 120 }), true);
  assert.equal(isInRange(1, { min: 1, max: 120 }), true);
  assert.equal(isInRange(0, { min: 1, max: 120 }), false);
  assert.equal(isInRange(121, { min: 1, max: 120 }), false);
});

/* ------------------------------------------------------------------ */
/* Settings migration and defaults                                     */
/* ------------------------------------------------------------------ */

check("settings: defaults match the requested behaviour", () => {
  assert.equal(DEFAULT_PRAYER_SETTINGS.preAdhanLeadMin, 10);
  assert.equal(DEFAULT_PRAYER_SETTINGS.preAdhanReminderEnabled, true);
  assert.deepEqual(
    Object.values(DEFAULT_PRAYER_SETTINGS.prePrayerPerPrayer),
    [true, true, true, true, true]
  );
  assert.equal(DEFAULT_PRAYER_SETTINGS.prePrayerVoiceEnabled, false);
  assert.equal(DEFAULT_PRAYER_SETTINGS.whiteDaysReminderEnabled, false);
  assert.equal(DEFAULT_PRAYER_SETTINGS.whiteDaysReminderTime, "20:00");
  assert.equal(DEFAULT_PRAYER_SETTINGS.whiteDaysHijriOffset, 0);
});

check("settings: an existing install keeps its own values", () => {
  const legacy = {
    enabled: true,
    preAdhanReminderEnabled: false,
    preAdhanLeadMin: 7,
    iqamaReminderLeadMin: 4,
    adhanSoundId: "zahrani",
  };
  const s = sanitizePrayerSettings(legacy);
  assert.equal(s.preAdhanReminderEnabled, false);
  assert.equal(s.preAdhanLeadMin, 7);
  assert.equal(s.iqamaReminderLeadMin, 4);
  assert.equal(s.adhanSoundId, "zahrani");
  // New per-prayer switches default to on, so nothing silently stops firing.
  assert.deepEqual(Object.values(s.prePrayerPerPrayer), [true, true, true, true, true]);
});

check("settings: explicit per-prayer switches survive, junk is ignored", () => {
  const s = sanitizePrayerSettings({
    prePrayerPerPrayer: { fajr: false, dhuhr: "no", asr: true, maghrib: false, isha: 1 },
  });
  assert.equal(s.prePrayerPerPrayer.fajr, false);
  assert.equal(s.prePrayerPerPrayer.maghrib, false);
  assert.equal(s.prePrayerPerPrayer.dhuhr, true);
  assert.equal(s.prePrayerPerPrayer.isha, true);
});

check("settings: a malformed white-days time falls back, a valid one normalises", () => {
  assert.equal(sanitizePrayerSettings({}).whiteDaysReminderTime, "20:00");
  assert.equal(
    sanitizePrayerSettings({ whiteDaysReminderTime: "06:30" }).whiteDaysReminderTime,
    "06:30"
  );
  assert.equal(
    sanitizePrayerSettings({ whiteDaysReminderTime: "7:05" }).whiteDaysReminderTime,
    "07:05"
  );
  assert.equal(
    sanitizePrayerSettings({ whiteDaysReminderTime: "25:00" }).whiteDaysReminderTime,
    "20:00"
  );
});

check("settings: the Hijri offset is clamped to -2…+2", () => {
  assert.equal(sanitizePrayerSettings({ whiteDaysHijriOffset: -5 }).whiteDaysHijriOffset, -2);
  assert.equal(sanitizePrayerSettings({ whiteDaysHijriOffset: 9 }).whiteDaysHijriOffset, 2);
  assert.equal(sanitizePrayerSettings({ whiteDaysHijriOffset: 1.7 }).whiteDaysHijriOffset, 1);
});

check("settings: voice is opt-in and survives a round trip", () => {
  assert.equal(sanitizePrayerSettings({}).prePrayerVoiceEnabled, false);
  assert.equal(
    sanitizePrayerSettings({ prePrayerVoiceEnabled: true }).prePrayerVoiceEnabled,
    true
  );
  // What the UI saves must sanitize back to the same values.
  const saved = { ...DEFAULT_PRAYER_SETTINGS, prePrayerVoiceEnabled: true, whiteDaysReminderEnabled: true };
  const round = sanitizePrayerSettings(saved);
  assert.equal(round.prePrayerVoiceEnabled, true);
  assert.equal(round.whiteDaysReminderEnabled, true);
  assert.equal(round.whiteDaysReminderTime, saved.whiteDaysReminderTime);
  assert.equal(round.preAdhanLeadMin, saved.preAdhanLeadMin);
});

check("settings: lead minutes are clamped to what the field allows", () => {
  // A value from an older build (or a tampered storage entry) must not schedule
  // a reminder hours off its prayer.
  assert.equal(sanitizePrayerSettings({ preAdhanLeadMin: 999 }).preAdhanLeadMin, 120);
  assert.equal(sanitizePrayerSettings({ preAdhanLeadMin: 0 }).preAdhanLeadMin, 1);
  assert.equal(sanitizePrayerSettings({ iqamaReminderLeadMin: 500 }).iqamaReminderLeadMin, 60);
});

/* ------------------------------------------------------------------ */
/* Locale coverage                                                     */
/* ------------------------------------------------------------------ */

check("locale: every new key exists in Arabic and English", () => {
  const source = readFileSync(join(ROOT, "src", "lib", "locale.ts"), "utf8");
  const ar = source.slice(source.indexOf("const AR"), source.indexOf("const EN"));
  const en = source.slice(source.indexOf("const EN"), source.indexOf("export const LOCALES"));
  const keys = [
    "settings.remindersSection",
    "settings.remindersIntro",
    "settings.reminderInAppOnly",
    "settings.prePrayerReminder",
    "settings.prePrayerReminderDesc",
    "settings.prePrayerLead",
    "settings.prePrayerPerPrayer",
    "settings.prayerVoice",
    "settings.prayerVoiceDesc",
    "settings.testVoice",
    "settings.prayerVoiceNote",
    "settings.whiteDays",
    "settings.whiteDaysDesc",
    "settings.whiteDaysTime",
    "settings.whiteDaysOffset",
    "settings.whiteDaysOffsetNote",
    "settings.whiteDaysNext",
    "settings.whiteDaysNone",
    "settings.whiteDaysFast",
    "whiteDays.title",
    "whiteDays.channelName",
    "whiteDays.channelDescription",
    "whiteDays.twoDaysBody",
    "whiteDays.oneDayBody",
    "whiteDays.labelTwoDays",
    "whiteDays.labelOneDay",
    "whiteDays.summary",
    "prayer.voiceBody",
  ];
  for (const key of keys) {
    assert.ok(ar.includes(`"${key}":`), `Arabic is missing ${key}`);
    assert.ok(en.includes(`"${key}":`), `English is missing ${key}`);
  }
});

check("locale: the voice sentence names the prayer and is user-editable text", () => {
  const source = readFileSync(join(ROOT, "src", "lib", "locale.ts"), "utf8");
  assert.ok(source.includes("نسأل الله أن يعيننا على ذكره وشكره وحسن عبادته"));
  assert.ok(source.includes('"prayer.voiceBody": "اقترب موعد صلاة {{prayer}}'));
});

/* ------------------------------------------------------------------ */
/* Existing reminder behaviour must not regress                        */
/* ------------------------------------------------------------------ */

check("existing: parseReminderTime still validates HH:MM", () => {
  assert.deepEqual(parseReminderTime("21:30"), { hours: 21, minutes: 30 });
  assert.equal(parseReminderTime("24:00"), null);
  assert.equal(parseReminderTime("9:5"), null);
});

check("existing: nextReminderAt rolls a passed time to tomorrow", () => {
  const now = at(2026, 10, 30, 22, 0);
  const next = nextReminderAt("21:00", now);
  assert.equal(iso(next), "2026-10-31");
});

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

let failures = 0;
for (const { name, fn } of total) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err && err.message) || err}`);
  }
}

console.log(`\nreminders: ${passed}/${total.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
