"use client";

import { Bell, CalendarDays, Clock, Moon, Volume2 } from "lucide-react";
import { useMemo } from "react";
import { Card, NumberField, SectionLabel, SegmentControl, Toggle } from "@/components/ui";
import { usePrayer } from "@/components/providers/PrayerProvider";
import { useLocale } from "@/lib/locale";
import { formatTime, PRAYER_LABELS, PRAYERS_ADHAN } from "@/lib/prayer";
import { speakPrayerAlert } from "@/lib/prayerVoice";
import {
  formatDayList,
  hijriMonthLabel,
  upcomingWhiteDays,
  type WhiteDaysKind,
} from "@/lib/whiteDays";
import type { WardData } from "@/hooks/useWardData";

/**
 * One place for every reminder instead of the three scattered cards this used
 * to be. The ward reminder keeps its existing settings keys
 * (`notificationsEnabled`, `reminderTime`); the pre-prayer reminder keeps
 * `preAdhanReminderEnabled` / `preAdhanLeadMin`; the new per-prayer switches
 * and white-days fields only narrow or add to them. Nothing is reset.
 */
export function RemindersSettingsPanel({ data }: { data: WardData }) {
  const { t, locale } = useLocale();
  const {
    settings,
    updateSettings,
    testAdhan,
    testChime,
    stopPlayback,
    playing,
  } = usePrayer();

  const whiteDaysPreview = useMemo(
    () =>
      upcomingWhiteDays(new Date(), {
        time: settings.whiteDaysReminderTime,
        offsetDays: settings.whiteDaysHijriOffset,
      }).slice(0, 2),
    [settings.whiteDaysReminderTime, settings.whiteDaysHijriOffset]
  );

  const kindLabel = (kind: WhiteDaysKind) =>
    t(kind === "twoDaysBefore" ? "whiteDays.labelTwoDays" : "whiteDays.labelOneDay");

  return (
    <div className="mt-5 space-y-4">
      <SectionLabel>{t("settings.remindersSection")}</SectionLabel>
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        {t("settings.remindersIntro")}
      </p>

      {/* SYSTEM NOTIFICATIONS */}
      <Card className="space-y-3 p-4">
        <Toggle
          checked={settings.browserNotifications}
          onChange={(v) => {
            updateSettings({ browserNotifications: v });
            if (v && "Notification" in window && Notification.permission === "default") {
              void Notification.requestPermission().then((perm) => {
                updateSettings({ browserNotifications: perm === "granted" });
              });
            }
          }}
          label={t("settings.systemNotifications")}
          description={t("settings.notificationsDesc")}
        />
        <p className="border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
          {t("settings.reminderInAppOnly")}
        </p>
      </Card>

      {/* DAILY WARD */}
      <Card className="space-y-4 p-4">
        <Toggle
          checked={data.settings.notificationsEnabled}
          onChange={(v) => data.updateSetting("notificationsEnabled", v)}
          label={t("settings.reminder")}
          description={t("settings.reminderDesc")}
        />
        {data.settings.notificationsEnabled && (
          <div className="animate-fade-up space-y-3 border-t border-line pt-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <Bell size={13} /> {t("settings.reminderTime")}
              </span>
              <input
                type="time"
                value={data.settings.reminderTime}
                onChange={(e) => data.updateSetting("reminderTime", e.target.value)}
                className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
              />
            </label>
            {data.reminderStatus === "scheduled" && (
              <p className="text-[10px] font-bold text-success">
                {t("settings.reminderStatus.scheduled")}
              </p>
            )}
            {data.reminderStatus === "permission-denied" && (
              <p className="text-[10px] font-bold text-danger">
                {t("settings.reminderStatus.permissionDenied")}
              </p>
            )}
            {data.reminderStatus === "unsupported" && (
              <p className="text-[10px] font-bold text-muted">
                {t("settings.reminderStatus.unsupported")}
              </p>
            )}
            {data.reminderStatus === "error" && (
              <p className="text-[10px] font-bold text-danger">
                {t("settings.reminderStatus.error")}
              </p>
            )}
            <button
              type="button"
              onClick={data.rescheduleReminder}
              className="h-9 w-full rounded-xl bg-surface-2 text-[10px] font-bold transition active:scale-[0.98]"
            >
              {t("settings.reminderStatus.reapply")}
            </button>
          </div>
        )}
      </Card>

      {/* PRAYER REMINDERS */}
      <Card className="space-y-4 p-4">
        <Toggle
          checked={settings.preAdhanReminderEnabled}
          onChange={(v) => updateSettings({ preAdhanReminderEnabled: v })}
          label={t("settings.prePrayerReminder")}
          description={t("settings.prePrayerReminderDesc")}
        />
        {settings.preAdhanReminderEnabled && (
          <div className="animate-fade-up space-y-4 border-t border-line pt-4">
            <NumberField
              label={t("settings.prePrayerLead")}
              value={settings.preAdhanLeadMin}
              onChange={(v) => updateSettings({ preAdhanLeadMin: v })}
              min={1}
              max={120}
            />

            <div>
              <p className="mb-2 text-[11px] font-bold text-muted">
                {t("settings.prePrayerPerPrayer")}
              </p>
              <div className="space-y-2">
                {PRAYERS_ADHAN.map((prayer) => (
                  <Toggle
                    key={prayer}
                    checked={settings.prePrayerPerPrayer[prayer] !== false}
                    onChange={(v) =>
                      updateSettings({
                        prePrayerPerPrayer: { ...settings.prePrayerPerPrayer, [prayer]: v },
                      })
                    }
                    label={t(PRAYER_LABELS[prayer])}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <Toggle
                checked={settings.prePrayerVoiceEnabled}
                onChange={(v) => updateSettings({ prePrayerVoiceEnabled: v })}
                label={t("settings.prayerVoice")}
                description={t("settings.prayerVoiceDesc")}
              />
              {settings.prePrayerVoiceEnabled && (
                <button
                  type="button"
                  onClick={() => speakPrayerAlert("asr", locale)}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-xs font-bold transition active:scale-[0.98]"
                >
                  <Volume2 size={14} className="text-gold-strong" />
                  {t("settings.testVoice")}
                </button>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                {t("settings.prayerVoiceNote")}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* IQAMA */}
      <Card className="space-y-4 p-4">
        <Toggle
          checked={settings.iqamaReminderEnabled}
          onChange={(v) => updateSettings({ iqamaReminderEnabled: v })}
          label={t("settings.iqamaReminder")}
          description={t("settings.iqamaReminderDesc")}
        />
        {settings.iqamaReminderEnabled && (
          <NumberField
            label={t("settings.iqamaLead")}
            value={settings.iqamaReminderLeadMin}
            onChange={(v) => updateSettings({ iqamaReminderLeadMin: v })}
            min={1}
            max={60}
          />
        )}
        <div className="rounded-2xl bg-surface-2 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-left text-xs font-bold text-muted">{t("settings.iqamaOffset")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateSettings({ iqamaOffsetMin: Math.max(0, settings.iqamaOffsetMin - 5) })}
                className="btn-icon h-8 w-8"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-black tabular-nums">
                {settings.iqamaOffsetMin}
              </span>
              <button
                type="button"
                onClick={() => updateSettings({ iqamaOffsetMin: Math.min(90, settings.iqamaOffsetMin + 5) })}
                className="btn-icon h-8 w-8"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* WHITE DAYS */}
      <Card className="space-y-4 p-4">
        <Toggle
          checked={settings.whiteDaysReminderEnabled}
          onChange={(v) => updateSettings({ whiteDaysReminderEnabled: v })}
          label={t("settings.whiteDays")}
          description={t("settings.whiteDaysDesc")}
        />
        {settings.whiteDaysReminderEnabled && (
          <div className="animate-fade-up space-y-4 border-t border-line pt-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <Clock size={13} /> {t("settings.whiteDaysTime")}
              </span>
              <input
                type="time"
                value={settings.whiteDaysReminderTime}
                onChange={(e) => updateSettings({ whiteDaysReminderTime: e.target.value || "20:00" })}
                className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
              />
            </label>

            <div>
              <p className="mb-1.5 text-[11px] font-bold text-muted">
                {t("settings.whiteDaysOffset")}
              </p>
              <SegmentControl
                options={[
                  { value: "-1", label: "-1" },
                  { value: "0", label: "0" },
                  { value: "1", label: "+1" },
                ]}
                value={String(settings.whiteDaysHijriOffset)}
                onChange={(value) => updateSettings({ whiteDaysHijriOffset: Number(value) })}
              />
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                {t("settings.whiteDaysOffsetNote")}
              </p>
            </div>

            <div className="rounded-2xl bg-surface-2 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <CalendarDays size={13} className="text-gold-strong" />
                {t("settings.whiteDaysNext")}
              </p>
              {whiteDaysPreview.length === 0 ? (
                <p className="text-[11px] text-muted">{t("settings.whiteDaysNone")}</p>
              ) : (
                <ul className="space-y-2">
                  {whiteDaysPreview.map((reminder) => (
                    <li key={reminder.key} className="text-[11px] leading-relaxed">
                      <span className="font-black text-ink">
                        {kindLabel(reminder.kind)}
                      </span>
                      {" — "}
                      {t("whiteDays.summary", {
                        month: hijriMonthLabel(reminder.fastDays[0].date, locale),
                        dates: formatDayList(
                          reminder.fastDays.map((d) => d.date),
                          locale
                        ),
                        time: formatTime(reminder.notifyAt, locale === "ar"),
                      })}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                <Moon size={12} className="text-gold-strong" />
                {t("settings.whiteDaysFast")}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* SOUNDS */}
      <Card className="space-y-3 p-4">
        <Toggle
          checked={settings.reminderSoundEnabled}
          onChange={(v) => updateSettings({ reminderSoundEnabled: v })}
          label={t("settings.reminderSound")}
          description={t("settings.reminderSoundDesc")}
        />
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => void testAdhan(PRAYERS_ADHAN[0])}
            disabled={playing}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold text-xs font-black text-primary-deep transition active:scale-[0.98] disabled:opacity-50"
          >
            <Volume2 size={14} />
            {t("settings.testAdhan")}
          </button>
          <button
            type="button"
            onClick={testChime}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 text-xs font-bold text-muted transition active:scale-[0.98]"
          >
            <Bell size={14} />
            {t("settings.testChime")}
          </button>
          {playing && (
            <button
              type="button"
              onClick={stopPlayback}
              className="flex h-10 items-center justify-center rounded-xl border border-danger/30 bg-danger-soft px-3 text-xs font-black text-danger transition active:scale-[0.98]"
            >
              {t("prayer.stopSound")}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
