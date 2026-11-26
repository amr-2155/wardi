# WARDI

An offline-first daily Quran reading tracker ("ward"). Next.js + Capacitor, Arabic
and English, web and Android from one codebase.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # generate route types, then tsc --noEmit
npm run lint       # eslint
npm test           # all verification harnesses
npm run audit      # fails on high/critical issues in production deps
```

`npm run audit` deliberately ignores dev-only tooling: ESLint, the Tailwind
PostCSS plugins and the Capacitor CLI are build-time only and never ship in the
APK. No high/critical advisories remain; three moderate dev-tooling advisories
are outside the shipped APK and excluded by design. The `overrides` entry pins
the `uuid` version that Capacitor's iOS-only `xcode` helper pulls in — this
project ships Android, so that path never runs, but its stale pin still surfaced
in audits.

The stack is pinned to Next.js 16.4.6 and Capacitor 8.5.3 — the releases that
clear the 16.x RCE advisories (`GHSA-mfr8-8qww-v76h`, `GHSA-vc7v-qv4w-wrv8`)
and the Capacitor proxy advisory (`GHSA-rvm3-566m-v7fv`, remote content
reachable at the app origin inside the WebView). The static export made the
image-optimizer advisories unreachable, but the WebView one shipped in the APK.

`npm test` runs twenty harnesses that compile and import the real source
modules with the project compiler, so a passing run means the shipped code
behaves:

| Harness                   | Covers                                        |
| ------------------------- | --------------------------------------------- |
| `scripts/test-ward.mjs`   | ward/page math, rollover, storage              |
| `scripts/test-ward-p0.mjs` | no false/duplicate completion; 25 pages = 25 pages; restart persistence |
| `scripts/test-ward-carryover.mjs` | three unfinished-ward choices, multi-day dates, no silent merge |
| `scripts/test-reflection.mjs` | reflection ayah grounded in pages actually read, no repeats |
| `scripts/test-quran.mjs`  | Quran loading, caching, offline fallback       |
| `scripts/test-offline.mjs`| network retry, error classification, fail-stop |
| `scripts/test-audio.mjs`  | audio playback recovery                        |
| `scripts/test-mushaf.mjs` | Mushaf index, session                          |
| `scripts/test-w1.mjs`     | backup/reset/rollover, reminder scheduling, i18n |
| `scripts/test-w2.mjs`     | bilingual UI, hardcoded-Arabic inventory       |
| `scripts/test-reminders.mjs` | White Days dates, reminder lead, numeric input, settings migration |
| `scripts/test-tadabbur.mjs` | tadabbur reachability, journal persistence   |
| `scripts/test-adhkar.mjs` | adhkar dataset uniqueness, completion feedback, search |
| `scripts/test-dataset-failure.mjs` | dataset failure surfacing and honest error states |
| `scripts/test-dataset-reload.mjs` | coordinated reload on reconnect |
| `scripts/test-dataset-timeout.mjs` | fetch timeout aborts and cleanup |
| `scripts/test-dialog-a11y.mjs` | dialog focus trap, Escape, labels, scroll lock |
| `scripts/test-ayah-menu.mjs` | ayah actions sheet contract and reuse of existing engines |
| `scripts/test-immersive.mjs` | immersive reader: overlay tools, reserved band, native bars |
| `scripts/test-tafsir-engine.mjs` | tafsir prompt, reviewed source pack, honest degradation |

Regenerating bundled assets (Quran dataset, glyph boxes, ayah metadata, Android
icons and pages):

```bash
node scripts/build-quran-dataset.mjs
node scripts/build-glyph-boxes.mjs
node scripts/build-ayah-meta.mjs
node scripts/download-tafsir-muyassar.mjs   # needs the network; rewrites its SHA-256 pin
pwsh scripts/generate-icons.ps1
pwsh scripts/generate-android-assets.ps1
```

Two checks need the network and are therefore not part of `npm test`:

```bash
npm run verify:verses   # every Quran card still quotes the verse it plays
npm run verify:hisn     # every Hisn al-Muslim mp3 exists and names the credited reciter
```

Both re-derive, rather than assume, the classification the adhkar dataset uses
(exact verse, excerpt, or no verified recording).

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

Ward progress is not "the page you are on". The mushaf session stores a
`recordedPages` set: progress is its size, and a ward is complete only when every
page in the planned range is in it. A page joins the set when the reader turns
forward past it or presses finish; opening the ward — or landing on its last
page — never completes it. Older sessions are migrated once from the legacy
`highestPageReached` counter, so upgrading cannot erase progress. On a history
entry, `plannedStart`/`plannedEnd` keep the range that was set while
`startPage`/`endPage` narrow to the pages actually read.

Adding a persisted feature means adding its key to `USER_DATA_KEYS` (or
`REGENERABLE_KEYS` if it can be rebuilt). Forgetting to do so means the value
survives a reset and is missing from a backup. `scripts/test-w1.mjs` enforces
this both ways: it scans `src/` for storage-key literals and fails when one is
unregistered, and it round-trips a real export containing the plain-string
preferences. Each registry entry declares its storage format (`json` or plain
`string`), because the locale, last page, reciter and TTS voice are
intentionally stored as bare text — import validates each key by its declared
format instead of assuming JSON everywhere.

Keys left behind by older releases are listed in `STALE_KEYS`: they are removed
by a full reset but deliberately kept out of the registry (no parser is left to
prove their shape) and out of backups (restoring one would only put stale state
back). A device that has been upgraded across releases keeps such keys in
storage, and they are invisible to both the registry and the regenerable list.

## Reminders

Every reminder switch lives in one Settings section (`RemindersSettingsPanel`):
the daily ward, pre-prayer alerts, iqama, White Days and the reminder sound.
Existing keys are reused, so an upgrade never resets a choice, and the new
fields are opt-in.

- **Daily ward.** `notificationsEnabled` and `reminderTime` schedule a daily
  reading reminder through `@capacitor/local-notifications`
  (`src/lib/wardReminder.ts`).
- **Before the prayer.** `preAdhanReminderEnabled` and `preAdhanLeadMin` fire
  ahead of each prayer, narrowed by per-prayer switches
  (`prePrayerPerPrayer`). An optional spoken sentence
  (`prePrayerVoiceEnabled`, `src/lib/prayerVoice.ts`) fills the case where no
  bundled recording exists: the only shipped adhan audio is the call to prayer,
  not a "the prayer is near" line.
- **Iqama.** `iqamaReminderEnabled` with its own lead, plus the iqama offset
  that shifts the displayed iqama time relative to the adhan.
- **White Days.** Two OS alarms per Hijri month — on the 11th and 12th — so the
  reader hears about the 13/14/15 fasts in advance, each message naming the
  actual dates. `src/lib/whiteDays.ts` finds the days by walking the Gregorian
  calendar through `Intl`'s Umm al-Qura conversion, so there are no month-length
  tables to drift; a −2…+2 correction (`whiteDaysHijriOffset`) lines it up with a
  locally sighted month, and the UI says the calendar is computed.

A web timer cannot deliver any of this: once the OS suspends the page, JS stops
running and the reminder never arrives. The OS alarm service is the only
mechanism that survives the screen locking or the app being killed, which is why
the plugin is used rather than a `setTimeout`.

The UI reports what the OS actually did — `scheduled`, `permission-denied`,
`unsupported`, or `error` — rather than showing a fixed reassurance. In a browser
build the honest answer is that reminders are not available; the plugin's alarms
are an Android feature. `reminderSignature` keys the schedule so the midnight
rollover and focus/resume events cannot stack duplicate notifications.

The notification text itself (title, body, channel name) comes from `locale.ts`
in both Arabic and English. The status lines under the time picker use the same
dictionary (`settings.reminderStatus.*`), so Settings follows the selected
language like the other main views.

**Device check (2026-11-18).** On the paired Android device the OS notification
store held the scheduled daily reminder `id=5001` — «وردك اليوم 25 صفحة: من صفحة
46 إلى 70» at `2026-11-18T05:03:00.000Z` on channel `wardi_ward_reminder` — and
the app launched without fatal errors. That proves the schedule survives a
reinstall with `-r` (user data preserved); the alarm *ringing audibly* at that
minute was not observed in this session, so audible delivery remains unverified.

## Tafsir

The ayah menu renders tafsir from three paths, in that order of trust.

1. **A reviewed source pack** (`src/data/quran/tafsir-rich.json`). Ten ayahs
   carry full articles: Al-Fatiha 1:1–1:7 plus 2:255, 2:285 and 2:286. Each is
   an article, not a stub — overview, vocabulary, context, revelation,
   detailed explanation, benefits, scholarly views, application, reflection,
   du'a and summary — and carries the source edition and review date it was
   checked against. The pack never stores the verse text: the panel prints the
   verse resolved from the canonical dataset, so the two cannot disagree.
   A second, derived pack (`src/lib/tafsir/summary.ts`) promotes the 24
   human-reviewed entries of the original `tafsir.json` into the same renderer,
   skipping the two already covered by full articles. That yields **32 reviewed
   ayahs** in total without writing a single new line of interpretation: the
   original "how to live" steps land in a separately labelled `practice` field
   so they are never passed off as scholarly exposition. Both packs are
   validated before display (`scripts/test-tafsir-engine.mjs`, C1–C6).
2. **A pinned published edition, offline.** `public/quran/tafsir-muyassar.json`
   holds all **6236 ayahs** of `ar-tafsir-muyassar` (التفسير الميسر), copied
   verbatim from [`spa5k/tafsir_api`](https://github.com/spa5k/tafsir_api)
   release `v1.2.3`, whose README credits TarteelAI's QUL resource 38. The
   mirror is MIT-licensed; the tafsir wording belongs to the named published
   edition and is redistributed with attribution. This is **not** an in-house
   human review: every entry is labelled `published`, carries the source
   edition and retrieval date, and gets its own badge and disclaimer. The asset
   is fetched from the app's own `public/` path after mount (never during
   render), and its exact bytes are checked against the SHA-256 pinned in
   `src/lib/quran/tafsirSource.const.ts` before parsing. A missing or tampered
   file resolves to the honest unavailable state; upstream is never contacted
   at runtime. Concurrent readers share one verified fetch, and a transient
   failure can be retried on the next screen mount. The panel's honesty label is
   also embedded in copied and shared text, so attribution survives export.
   Regenerate deliberately with
   `node scripts/download-tafsir-muyassar.mjs` — that script also rewrites the
   hash constant and fails unless all 6236 refs are present and unique.
3. **An optional operator-deployed proxy.** `NEXT_PUBLIC_TAFSIR_AI_URL` points
   at a trusted server; the static bundle holds no model key and calls no vendor
   directly. Generated output is validated before display (JSON shape, same
   reference, no verse text supplied, no unfilled placeholders) and is marked
   as a draft. Invalid output is discarded rather than shown as tafsir.

When no source applies, the panel states the reason — missing dataset, unknown
reference, source still loading or failing its fingerprint, no source, or AI
disabled — instead of inventing commentary. The proxy path remains **wired**:
the ayah screen and the ayah action sheet show an explicit "Generate AI tafsir"
action only when `NEXT_PUBLIC_TAFSIR_AI_URL` is configured. Nothing calls the
network on render; the keyed generation hook discards a stale in-flight result
when the ayah, dataset or published pack changes, and a reviewed or published
source always wins over an earlier draft. Without a proxy, the shipped app
stays offline with its reviewed and published packs.
`scripts/test-tafsir-engine.mjs` gates the prompt, all three paths, the labels,
the hash, the published pack's completeness and every degradation path (C1–C7).

## Home-screen widgets

Three Android widget sizes read from one payload the app pushes:
`strip` (4×1), `next` (4×2) and `overview` (4×3). The web side computes the
schedule with the same `adhan` code as the in-app screens and hands it over
(`src/lib/prayerWidgetSync.ts` → `WardiWidgetPlugin`); the widget never
recalculates a time, so the launcher and the app cannot drift apart.

The payload covers 14 rolling days with pre-formatted labels, which lets the
widgets roll the date and the countdown over midnight with the app closed.
`WardiWidgetRefresh` redraws at the next prayer boundary and after boot, date
change, clock change and timezone change. A widget tap deep-links back into the
prayer screen (`src/lib/widgetNavigation.ts`).

**Device check (2026-11-18).** The launcher held a live
`WardiPrayerWidgetStrip` instance (`id=46`) with populated `RemoteViews`, and the
receivers are registered in the manifest. Pixel-level layout/resizing and the
live countdown were not screenshotted, so visual polish is still unconfirmed.

## Adhkar audio

Playback uses two real, attributable sources; neither is a synthesized voice.

- **Quran cards** carry verse references and play the per-ayah recording of the
  reciter chosen in the screen. The five offered reciters were each verified to
  serve every referenced verse, and the recording is the verse the card quotes.
- **Hadith cards** carry a Hisn al-Muslim id and play that dhikr's published mp3.
  An id is attached only after the recording's words were matched to the card's;
  the credited reciter comes from the file's own `TPE1` tag, never from
  guesswork. Clips that read more than the card says so through `audioNote`.

A card with no verified reference is simply not playable — there is no fallback
to machine speech on the playback path. `npm run verify:verses` and
`npm run verify:hisn` re-check both claims against the live sources when the
dataset changes. Text-to-speech survives only for the app's own sentences (the
pre-prayer alert); the old voice-count feature and its `RECORD_AUDIO` permission
were removed with it.

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

The app never changes the system screen timeout. On the verification device it
was left at its existing `1800000` ms (30 minutes) setting, as chosen by the
user. The identical `1800000` in the widget XML is `updatePeriodMillis` — an
unrelated widget refresh interval, not a display setting.

## Known limitations

- On-device checks confirmed the scheduled reminder and a live widget instance
  after reinstall (see above), but an audible alarm at the scheduled minute and
  the widget's pixel-level rendering were not observed.
- Tafsir coverage has two clearly separated tiers. Only 32 ayahs (10 full
  articles + 22 promoted reviewed summaries) are in-house reviewed. The bundled
  `التفسير الميسر` edition (`public/quran/tafsir-muyassar.json`, hash-pinned and
  verified at load) covers all 6236 ayahs offline, but its text is copied
  verbatim from a published source and is labelled as such — it is not an
  in-house human review. The live generator is wired but unconfigured by
  default: without an operator-deployed `NEXT_PUBLIC_TAFSIR_AI_URL` it stays
  dormant, and only the honest "no source available" state appears if neither
  the reviewed pack nor the published edition can be selected.
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
