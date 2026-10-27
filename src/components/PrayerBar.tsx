"use client";

import { Bell, ChevronDown, MapPin, Moon, Sun, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePrayer, type PrayerAlert } from "@/components/providers/PrayerProvider";
import { useLocale } from "@/lib/locale";
import {
  formatTime,
  humanizeDuration,
  PRAYER_LABELS,
  PRAYER_ORDER,
  splitDuration,
  type PrayerId,
} from "@/lib/prayer";

function PrayerIcon({ prayer }: { prayer: PrayerId }) {
  const isDay = prayer === "sunrise" || prayer === "dhuhr" || prayer === "asr";
  return isDay ? <Sun size={13} className="text-gold" /> : <Moon size={13} className="text-gold" />;
}

export function PrayerBar() {
  const { t, locale } = useLocale();
  const {
    settings,
    coords,
    locationStatus,
    requestLocation,
    today,
    next,
    current,
    alert,
    dismissAlert,
    playing,
    testAdhan,
    stopPlayback,
  } = usePrayer();
  const [userOpen, setUserOpen] = useState(false);
  const [justOpened, setJustOpened] = useState(false);
  const open = userOpen || !!alert;

  const arabicDigits = locale === "ar";

  const toggleOpen = () => {
    if (alert) {
      dismissAlert();
      return;
    }
    if (userOpen) {
      setUserOpen(false);
      setJustOpened(false);
    } else {
      setUserOpen(true);
    }
  };

  useEffect(() => {
    if (open && !justOpened) {
      const id = window.setTimeout(() => setJustOpened(true), 40);
      return () => window.clearTimeout(id);
    }
  }, [open, justOpened]);

  if (!settings.enabled) return null;

  const parts = next ? splitDuration(next.secondsTo) : null;
  const includeSec = !parts || (parts.days === 0 && parts.hours === 0);
  const countdownLabel = next && parts ? humanizeDuration(parts, locale, includeSec) : "";
  const morning = next?.prayer === "dhuhr" || next?.prayer === "asr";

  let progress = 0;
  if (next && today) {
    const nowTs = next.time.getTime() - next.secondsTo * 1000;
    const prevTs =
      current && today[current] ? today[current].getTime() : new Date(nowTs).setHours(0, 0, 0, 0);
    const total = Math.max(1, next.time.getTime() - prevTs);
    progress = Math.min(100, Math.max(0, ((nowTs - prevTs) / total) * 100));
  }
  const leadingIcon =
    next?.prayer === "sunrise"
      ? { icon: <Sun size={15} className="text-gold" />, tone: "bg-gold-soft" }
      : morning
        ? { icon: <Sun size={15} className="text-gold" />, tone: "bg-primary-soft" }
        : { icon: <Moon size={15} className="text-gold" />, tone: "bg-primary-soft" };

  const iqama = settings.iqamaOffsetMin;

  return (
    <div className="relative z-20 mb-4">
      {/* NOTE: a div (not a button) on purpose — the card contains an inner
          location <button>, and button-in-button breaks hydration. */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen();
          }
        }}
        aria-expanded={open}
        aria-label={t("prayer.barLabel")}
        className={`w-full cursor-pointer overflow-hidden rounded-3xl border text-start transition-all duration-300 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          open ? "border-gold/50 bg-surface shadow-lg" : "border-line bg-surface shadow-sm"
        }`}
      >
        {/* accent line */}
        <div className="h-[2px] w-full bg-gradient-to-l from-gold/60 via-gold/20 to-primary/10" />

        {/* header row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${leadingIcon.tone}`}
          >
            {leadingIcon.icon}
          </span>

          {next && next.secondsTo > 0 ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-wide text-muted">
                  {t("prayer.next")}
                </span>
                <span
                  key={next.prayer}
                  className="block truncate text-lg font-black leading-tight text-ink animate-fade-up"
                >
                  {t(PRAYER_LABELS[next.prayer])}
                </span>
                <span className="block text-[11px] font-bold tabular-nums text-muted">
                  {countdownLabel}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-black leading-tight tabular-nums text-primary">
                  {formatTime(next.time, arabicDigits)}
                </span>
                <span className="text-[10px] font-bold text-muted">{t("prayer.remaining")}</span>
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1">
              <span
                key={next?.prayer}
                className="block truncate text-lg font-black leading-tight text-ink animate-fade-up"
              >
                {next ? t(PRAYER_LABELS[next.prayer]) : "—"}
              </span>
              <span className="text-xs font-black text-gold-strong">{t("prayer.now")}</span>
            </span>
          )}

          <ChevronDown
            size={16}
            className={`shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </div>

        {/* progress bar */}
        {next && next.secondsTo > 0 && (
          <div className="h-[3px] w-full">
            <div
              className="h-full bg-gradient-to-l from-gold/80 to-primary/60 transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* dropdown */}
        <div
          className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t border-line px-3 pb-3 pt-2">
              {/* location row */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  requestLocation();
                }}
                className="mb-2 flex w-full items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-muted transition active:scale-[0.99]"
              >
                <MapPin size={12} className="text-gold-strong" />
                <span className="tabular-nums" dir="ltr">
                  {coords.latitude.toFixed(2)}, {coords.longitude.toFixed(2)}
                </span>
                {locationStatus === "loading" && (
                  <span className="ms-auto text-gold-strong">{t("prayer.locating")}</span>
                )}
                {locationStatus === "ok" && (
                  <span className="ms-auto text-success">{t("prayer.autoLoc")}</span>
                )}
                {locationStatus === "denied" && (
                  <span className="ms-auto text-danger">{t("prayer.manualLoc")}</span>
                )}
                <span className="ms-2 text-[10px] text-muted">{t("prayer.tapLocate")}</span>
              </button>

              {/* prayer list */}
              <ul className="space-y-1">
                {PRAYER_ORDER.map((p, i) => {
                  const time = today?.[p];
                  const isNow = current === p;
                  const isNext = next?.prayer === p;
                  const iqamaTime = iqama > 0 && time ? new Date(time.getTime() + iqama * 60000) : null;
                  return (
                    <li
                      key={p}
                      style={{ animationDelay: `${i * 45}ms` }}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors ${
                        isNext
                          ? "bg-primary text-white"
                          : isNow
                            ? "bg-gold-soft text-primary-deep"
                            : "hover:bg-surface-2"
                      } ${justOpened ? "animate-fade-up" : ""}`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                          isNext ? "bg-white/15" : "bg-surface-2"
                        }`}
                      >
                        <PrayerIcon prayer={p} />
                      </span>
                      <span
                        className={`inline-flex flex-1 items-center justify-start gap-1.5 rounded-2xl text-start text-xs font-black ${
                          isNext ? "text-white" : isNow ? "text-primary-deep" : "text-ink"
                        }`}
                      >
                        {isNow && (
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse-subtle ${
                              isNext ? "bg-white" : "bg-gold"
                            }`}
                          />
                        )}
                        <span>{t(PRAYER_LABELS[p])}</span>
                        {time && (
                          <span
                            className={`tabular-nums ${
                              isNext ? "text-gold" : "text-gold-strong"
                            }`}
                          >
                            · {formatTime(time, arabicDigits)}
                          </span>
                        )}
                      </span>
                      {iqamaTime && (
                        <span
                          className={`shrink-0 text-[10px] font-bold tabular-nums ${
                            isNext ? "text-white/70" : "text-muted"
                          }`}
                        >
                          {t("prayer.iqama")} · {formatTime(iqamaTime, arabicDigits)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* sound controls */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void testAdhan(next?.prayer ?? "fajr");
                  }}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold text-xs font-black text-primary-deep transition active:scale-[0.98]"
                >
                  <Volume2 size={14} />
                  {t("prayer.preview")}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    stopPlayback();
                  }}
                  disabled={!playing}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 text-xs font-bold text-muted transition active:scale-[0.98] disabled:opacity-40"
                >
                  <VolumeX size={14} />
                  {t("prayer.stopSound")}
                </button>
              </div>

              {playing && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-success">
                  <Bell size={11} />
                  {t("prayer.adhanPlaying")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {alert && <AlertBanner alert={alert} onClose={dismissAlert} />}
    </div>
  );
}

function AlertBanner({ alert, onClose }: { alert: PrayerAlert; onClose: () => void }) {
  const { t } = useLocale();
  const isAdhan = alert.kind === "adhan";
  const isIqama = alert.kind === "iqama" || alert.kind === "iqamaReminder";
  const iconTone = isAdhan
    ? "bg-gold text-primary-deep"
    : isIqama
      ? "bg-info-soft text-info"
      : "bg-success-soft text-success";
  const barTone = isAdhan ? "bg-gold" : isIqama ? "bg-info" : "bg-success";
  const title = t(alert.title);
  return (
    <div
      role="alert"
      className="animate-scale-in-soft fixed inset-x-4 top-4 z-50 mx-auto max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
    >
      <div className={`h-1.5 w-full ${barTone}`} />
      <div className="flex items-center gap-3 p-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconTone}`}>
          {isAdhan ? <Volume2 size={20} /> : <Bell size={18} />}
        </span>
        <div className="min-w-0 flex-1 text-start">
          <p className="text-sm font-black text-ink">{title}</p>
          <p className="mt-0.5 text-xs font-bold text-muted">
            <AlertBody alert={alert} />
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("ui.close")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted transition active:scale-95"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function AlertBody({ alert }: { alert: PrayerAlert }) {
  const { t, locale } = useLocale();
  const prayerLabel = t(PRAYER_LABELS[alert.prayer]);
  const arabicDigits = locale === "ar";
  let body: string;
  switch (alert.kind) {
    case "adhan":
      // The provider puts a real message key in `body`: `adhan.playingBody`
      // when audio actually started, `adhan.playError` / `adhan.autoplayNote`
      // when it did not. Re-deriving the success text from `kind` here would
      // report the adhan as playing during a playback failure, so failures
      // are shown with the same params the provider used for the OS notification.
      body =
        alert.body === "adhan.playingBody"
          ? t("adhan.playingBody", {
              prayer: prayerLabel,
              time: formatTime(alert.time ?? new Date(), arabicDigits),
            })
          : t(alert.body, { prayer: prayerLabel, time: formatTime(alert.time ?? new Date(), arabicDigits) });
      break;
    case "reminder":
      // `alert.body` is already a resolved key (`prayer.reminderBody`), and
      // `prayer` is a fixed adhan prayer, so the label is used as the param.
      body = t(alert.body, { prayer: prayerLabel });
      break;
    case "iqamaReminder":
      body = t("iqama.soonBody", { prayer: prayerLabel });
      break;
    case "iqama":
      body = t("iqama.body", { prayer: prayerLabel });
      break;
  }
  return <>{body}</>;
}