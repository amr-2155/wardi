# WARDI

An offline-first daily Quran reading tracker ("ward"). Next.js + Capacitor, Arabic
and English, web and Android from one codebase.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # all verification harnesses
```

`npm test` runs fifteen harnesses that compile and import the real source modules
with the project compiler, so a passing run means the shipped code behaves:

| Harness                   | Covers                                        |
| ------------------------- | --------------------------------------------- |
| `scripts/test-ward.mjs`   | ward/page math, rollover, storage              |
| `scripts/test-quran.mjs`  | Quran loading, caching, offline fallback       |
| `scripts/test-offline.mjs`| network retry, error classification, fail-stop |
| `scripts/test-audio.mjs`  | audio playback recovery                        |
| `scripts/test-mushaf.mjs` | Mushaf index, session                          |
| `scripts/test-w1.mjs`     | backup/reset/rollover, reminder scheduling, i18n |
| `scripts/test-w2.mjs`     | bilingual UI, hardcoded-Arabic inventory       |
| `scripts/test-tadabbur.mjs` | tadabbur reachability, journal persistence   |
| `scripts/test-adhkar.mjs` | adhkar dataset uniqueness, completion feedback, search |
| `scripts/test-dataset-failure.mjs` | dataset failure surfacing and honest error states |
| `scripts/test-dataset-reload.mjs` | coordinated reload on reconnect |
| `scripts/test-dataset-timeout.mjs` | fetch timeout aborts and cleanup |
| `scripts/test-dialog-a11y.mjs` | dialog focus trap, Escape, labels, scroll lock |
| `scripts/test-ayah-menu.mjs` | ayah actions sheet contract and reuse of existing engines |
| `scripts/test-immersive.mjs` | immersive reader: overlay tools, reserved band, native bars |

Regenerating bundled assets (Quran dataset, glyph boxes, ayah metadata, Android
icons and pages):

```bash
node scripts/build-quran-dataset.mjs
node scripts/build-glyph-boxes.mjs
node scripts/build-ayah-meta.mjs
pwsh scripts/generate-icons.ps1
pwsh scripts/generate-android-assets.ps1
```

Generated output is gitignored and reproducible from these scripts. Never delete
the bundled Quran or page assets to "clean up" — they are what makes the app work
offline.

## Data model

Everything the user creates lives in `localStorage` under keys registered in
`src/lib/userData.ts`. That registry is the single source of truth for three
operations, so they cannot drift apart:

- **Backup** (`src/lib/backup.ts`) exports every registered key except the
  regenerable caches. Backups are versioned and stamped `app: "wardi"`; importing
  validates before it writes anything, and never partially applies a bad file.
- **Reset** clears every registered key and reports any key that survived, so a
  partial failure is visible instead of silent.
- **Settings** toggles flow through the same key set.

Adding a persisted feature means adding its key to `USER_DATA_KEYS` (or
`REGENERABLE_KEYS` if it can be rebuilt). Forgetting to do so means the value
survives a reset and is missing from a backup — both are covered by
`scripts/test-w1.mjs`.

## Reading reminder

`notificationsEnabled` and `reminderTime` in Settings schedule a daily reading
reminder through `@capacitor/local-notifications` (`src/lib/wardReminder.ts`).

A web timer cannot deliver this: once the OS suspends the page, JS stops running
and the reminder never arrives. The OS alarm service is the only mechanism that
survives the screen locking or the app being killed, which is why the plugin is
used rather than a `setTimeout`.

The UI reports what the OS actually did — `scheduled`, `permission-denied`,
`unsupported`, or `error` — rather than showing a fixed reassurance. In a browser
build the honest answer is that reminders are not available; the plugin's alarms
are an Android feature. `reminderSignature` keys the schedule so the midnight
rollover and focus/resume events cannot stack duplicate notifications.

The notification text itself (title, body, channel name) comes from `locale.ts`
in both Arabic and English. The status lines under the time picker use the same
dictionary (`settings.reminderStatus.*`), so Settings follows the selected
language like the other main views.

**Not yet verified on hardware.** The scheduling calls, permission handling,
boot restoration, and exact-alarm behaviour have been compiled, packaged, and
inspected in the APK, but no physical-device run has confirmed a notification
actually arrives. Treat delivery as unproven until someone runs it on a device.

## Android

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`. Gradle needs roughly
1 GB of free heap; on a memory-constrained machine use
`-Dorg.gradle.jvmargs=-Xmx640m -Dorg.gradle.parallel=false`.

The notification permissions (`POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`,
`WAKE_LOCK`, `SCHEDULE_EXACT_ALARM`) and the plugin's receivers are contributed by
the plugin's own manifest through Gradle manifest merging, so they do not appear
in `android/app/src/main/AndroidManifest.xml`. To confirm they were merged, read
`android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`.

## Known limitations

- Reminder delivery is unverified on real devices (see above).
- Topic-name normalization is inconsistent: 26 references across 6 topics cannot
  be reached by search. Left as-is; it is unrelated to the data-integrity work.
- Localization is broad but not total. Home, Plan, Stats, Settings, History,
  Khatma, the ayah reader and the Mushaf reader are bilingual. The remaining
  hardcoded Arabic is confined to the audio/reciter UI, the prayer provider and
  progress ring, and Tadabbur share/copy templates — the closed inventory in
  `scripts/test-w2.mjs` lists each file and the reason it was left.
- The prayer, adhkar and niyyah screens are reachable from Home/Library and are
  covered by the i18n gates; earlier revisions of this file said otherwise.
  Prayer *delivery* (adhan audio and OS notifications) still needs a
  physical-device run — the build only proves it compiles and packages.
