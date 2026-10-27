"use client";

import { useState } from "react";
import { ArrowLeft, BookOpenCheck, Check, Compass, MapPin, Moon, Navigation2, Sun, Volume2, VolumeX } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui";
import { PrayerSky } from "@/components/PrayerSky";
import { AFTER_PRAYERS, loadAfterPrayer, toggleAfterPrayer } from "@/lib/afterPrayer";
import { todayKey } from "@/lib/dates";
import { iqamaOf, usePrayer, type LocationStatus } from "@/components/providers/PrayerProvider";
import { formatLocaleDate, useLocale } from "@/lib/locale";
import {
  formatTime,
  humanizeDuration,
  METHODS,
  PRAYER_LABELS,
  PRAYER_ORDER,
  splitDuration,
  type PrayerId,
} from "@/lib/prayer";
import type { CoordinatesLike } from "@/lib/prayer";

/** the Kaaba — the fixed point every bearing is measured to. */
const KAABA = { latitude: 21.4225, longitude: 39.8262 };

/* Bearing is measured as a turn from north, so a straight east/west line of
   position must not turn into a division by zero at the equator. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle initial bearing from the user to the Kaaba, in degrees from
 * true north. Computed locally in both directions of travel, so it needs no
 * network and no sensor — a device compass would only tell us which way the
 * phone is held, which is what the user aligns by hand.
 */
export function qiblaBearing(from: CoordinatesLike): number {
  const phi1 = toRad(from.latitude);
  const phi2 = toRad(KAABA.latitude);
  const dLambda = toRad(KAABA.longitude - from.longitude);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const bearing = Math.atan2(y, x);
  if (!Number.isFinite(bearing)) return 0;
  return ((bearing * 180) / Math.PI + 360) % 360;
}

/** `YYYY-MM-DD` in device-local time — the key format `formatLocaleDate` takes. */
function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function PrayerGlyph({ prayer }: { prayer: PrayerId }) {
  const isDay = prayer === "sunrise" || prayer === "dhuhr" || prayer === "asr";
  return isDay ? <Sun size={14} className="text-gold" /> : <Moon size={14} className="text-gold" />;
}

function LocationState({ status }: { status: LocationStatus }) {
  const { t } = useLocale();
  if (status === "loading") return <span className="text-gold-strong">{t("prayer.locating")}</span>;
  if (status === "ok") return <span className="text-success">{t("prayer.autoLoc")}</span>;
  return <span className="text-danger">{t("prayer.manualLoc")}</span>;
}

export function PrayerView({ onBack }: { onBack: () => void }) {
  const { t, locale } = useLocale();
  const {
    settings,
    coords,
    locationStatus,
    requestLocation,
    today,
    next,
    current,
    now,
    playing,
    testAdhan,
    stopPlayback,
  } = usePrayer();

  const arabicDigits = locale === "ar";
  const fmt = (d: Date) => formatTime(d, arabicDigits);

  /* After-prayer micro-ward checklist: prayers whose time has passed today,
     each with a "read two pages" tick. Date-scoped, uncoupled from ward
     progress by design. */
  const dayKey = todayKey();
  const [afterDone, setAfterDone] = useState(() => loadAfterPrayer(dayKey));
  const duePrayers = (today ? AFTER_PRAYERS : []).filter(
    (p) => today && today[p].getTime() <= now.getTime()
  );
  /* display only: degree readouts and the countdown should not be Latin
     numerals inside an Arabic-only screen (PrayerProvider stays locale-free). */
  const localizeNumbers = (s: string) =>
    arabicDigits ? s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]) : s;

  const parts = next ? splitDuration(next.secondsTo) : null;
  const includeSeconds = !parts || (parts.days === 0 && parts.hours === 0);
  const countdown = next && parts ? humanizeDuration(parts, locale, includeSeconds) : "";

  /* Progress through the interval that leads to the next prayer. */
  let progress = 0;
  if (today && next && next.secondsTo > 0) {
    const nowTs = next.time.getTime() - next.secondsTo * 1000;
    const prevTs =
      current && today[current]
        ? today[current].getTime()
        : new Date(nowTs).setHours(0, 0, 0, 0);
    progress = Math.min(100, Math.max(0, ((nowTs - prevTs) / Math.max(1, next.time.getTime() - prevTs)) * 100));
  }

  const iqamaOffset = settings.iqamaOffsetMin;
  const methodLabel = METHODS.find((m) => m.id === settings.method)?.label ?? "";
  const activeMethod = methodLabel ? t(methodLabel) : "";
  const bearing = qiblaBearing(coords);
  const bearingText = `${localizeNumbers(String(Math.round(bearing)))}° ${t("prayer.qiblaFromNorth")}`;

  return (
    <>
      {/* Fixed so the way back stays reachable on a long timetable. */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("ui.back")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-ink shadow-sm transition active:scale-95"
          >
            <ArrowLeft size={18} className="rtl:rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-black leading-tight">{t("prayer.title")}</h2>
            <p className="truncate text-[11px] text-muted">
              {formatLocaleDate(locale, localDateKey(now))}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink">
            <Compass size={18} />
          </span>
        </div>
      </header>

      <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 pt-24">
        {/* NEXT PRAYER — the reason the screen exists, so it leads. The living
            mosque sky sits behind a scrim so the countdown stays readable in
            every phase, day or night. */}
        <div className="animate-rise-in relative overflow-hidden rounded-[26px] border border-line shadow-sm">
          <PrayerSky prayer={next?.prayer ?? current ?? "dhuhr"} />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/72 to-surface/10" />
          <div className="relative p-5">
          <div className="pointer-events-none absolute -end-16 -top-16 h-44 w-44 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-muted">
                {next && next.secondsTo > 0 ? t("prayer.next") : t("prayer.now")}
              </p>
              <p className="mt-1 truncate text-4xl font-black leading-none text-ink">
                {next ? t(PRAYER_LABELS[next.prayer]) : "—"}
              </p>
              <p className="mt-2 text-sm font-black tabular-nums text-primary">
                {next ? fmt(next.time) : "—"}
              </p>
            </div>
            {next && next.secondsTo > 0 && (
              <div className="shrink-0 text-end">
                <p className="text-[11px] font-bold text-muted">{t("prayer.remaining")}</p>
                <p className="mt-1 text-lg font-black tabular-nums text-gold-strong">{countdown}</p>
              </div>
            )}
          </div>

          {next && next.secondsTo > 0 && (
            <div className="relative mt-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="progress-animated-bar h-full rounded-full bg-gradient-to-l from-gold/80 to-primary/60"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-muted">
                <span>{t("prayer.remaining")}</span>
                <span className="tabular-nums">{localizeNumbers(`${Math.round(progress)}%`)}</span>
              </div>
            </div>
          )}

          <div className="relative mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void testAdhan(next?.prayer ?? "fajr")}
              disabled={playing}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gold text-xs font-black text-primary-deep transition active:scale-[0.98] disabled:opacity-50"
            >
              <Volume2 size={15} />
              {t("prayer.preview")}
            </button>
            <button
              type="button"
              onClick={stopPlayback}
              disabled={!playing}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 text-xs font-bold text-muted transition active:scale-[0.98] disabled:opacity-40"
            >
              <VolumeX size={15} />
              {t("prayer.stopSound")}
            </button>
          </div>

          <p
            aria-live="polite"
            className={`mt-2 text-center text-[11px] font-bold ${playing ? "text-success" : "text-muted"}`}
          >
            {playing ? t("prayer.adhanPlaying") : ""}
          </p>
          </div>
        </div>

        {/* AFTER-PRAYER MICRO-WARD — two pages after each fard whose time
            has passed. Checklist only; never touches ward progress. */}
        {duePrayers.length > 0 && (
          <section className="mt-4 rounded-[26px] border border-line bg-surface p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-black text-muted">
              <BookOpenCheck size={13} className="text-gold-strong" />
              {t("prayer.afterTitle")}
            </div>
            <p className="mb-2.5 px-1 text-[10px] text-muted">{t("prayer.afterSub")}</p>
            <ul className="space-y-1.5">
              {duePrayers.map((p) => {
                const done = afterDone.includes(p);
                return (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => setAfterDone(toggleAfterPrayer(dayKey, p))}
                      aria-pressed={done}
                      className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-xs font-black transition active:scale-[0.98] ${
                        done ? "bg-gold-soft text-gold-strong" : "bg-surface-2 text-ink"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          done ? "bg-gold text-primary-deep" : "bg-surface text-muted ring-1 ring-line"
                        }`}
                      >
                        {done && <Check size={13} strokeWidth={3.5} />}
                      </span>
                      {t(PRAYER_LABELS[p])}
                      <span className="ms-auto text-[10px] font-bold text-muted">
                        {done ? t("prayer.afterRead") : fmt(today![p])}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* TODAY'S TIMETABLE */}
        <section className="mt-5">
          <SectionLabel>{t("prayer.today")}</SectionLabel>
          <Card className="overflow-hidden">
            <ul>
              {PRAYER_ORDER.map((p, i) => {
                const time = today?.[p];
                const isNow = current === p;
                const isNext = next?.prayer === p;
                const iqamaTime = time && iqamaOffset > 0 ? iqamaOf(time, iqamaOffset) : null;
                return (
                  <li
                    key={p}
                    aria-current={isNow ? "time" : undefined}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    } ${isNext ? "bg-primary-soft" : isNow ? "bg-gold-soft/60" : ""}`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                        isNext ? "bg-primary text-white" : "bg-surface-2"
                      }`}
                    >
                      <PrayerGlyph prayer={p} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-black text-ink">{t(PRAYER_LABELS[p])}</span>
                        {isNow && <span className="h-1.5 w-1.5 shrink-0 animate-pulse-subtle rounded-full bg-gold" />}
                      </span>
                      {iqamaTime && (
                        <span className="mt-0.5 block text-[10px] font-bold text-muted">
                          {t("prayer.iqama")} · <span className="tabular-nums">{fmt(iqamaTime)}</span>
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-black tabular-nums text-primary">
                      {time ? fmt(time) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        {/* METHOD + LOCATION */}
        <section className="mt-5">
          <SectionLabel>{t("prayer.details")}</SectionLabel>
          <Card className="divide-y divide-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-muted">{t("prayer.methodLabel")}</span>
                <span className="mt-0.5 block truncate text-sm font-black text-ink">{activeMethod}</span>
              </span>
              <span className="shrink-0 rounded-xl bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted">
                {t("prayer.asrLabel")} ·{" "}
                {settings.asr === "hanafi" ? t("settings.asrHanafi") : t("settings.asrStandard")}
              </span>
            </div>

            <div className="flex items-center gap-3 px-4 py-3">
              <MapPin size={15} className="shrink-0 text-gold-strong" />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-muted">{t("prayer.locationLabel")}</span>
                {settings.autoLocation ? (
                  <span className="mt-0.5 block text-sm font-black text-ink">{t("prayer.autoLoc")}</span>
                ) : (
                  <span className="mt-0.5 block text-sm font-black tabular-nums text-ink" dir="ltr">
                    {coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)}
                  </span>
                )}
                <span className="mt-0.5 block text-[10px] font-bold">
                  <LocationState status={locationStatus} />
                </span>
              </span>
              <button
                type="button"
                onClick={requestLocation}
                aria-label={t("prayer.relocate")}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-line bg-surface-2 px-3 text-[11px] font-black text-ink transition active:scale-95"
              >
                <MapPin size={13} className="text-gold-strong" />
                {t("prayer.relocate")}
              </button>
            </div>
          </Card>
          {!settings.autoLocation && (
            <p className="mt-2 px-1 text-[10px] text-muted">{t("settings.autoLocationDesc")}</p>
          )}
        </section>

        {/* QIBLA — a bearing from true north, computed from the same coords. */}
        <section className="mt-5">
          <SectionLabel>{t("prayer.qibla")}</SectionLabel>
          <Card className="flex items-center gap-4 p-4">
            {/* dir=ltr: a true bearing is absolute, so the needle must not
                mirror when the layout flips to RTL. */}
            <span
              dir="ltr"
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold-soft"
            >
              <span
                className="flex h-11 w-11 items-center justify-center"
                style={{ transform: `rotate(${bearing}deg)` }}
              >
                <Navigation2 size={26} className="text-gold-strong" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-ink">{t("prayer.qibla")}</span>
              <span className="mt-1 block text-lg font-black tabular-nums text-gold-strong">
                {bearingText}
              </span>
              {locationStatus !== "ok" && (
                <span className="mt-0.5 block text-[10px] font-bold text-muted">
                  {t("prayer.tapLocate")}
                </span>
              )}
            </span>
          </Card>
        </section>
      </div>
    </>
  );
}
