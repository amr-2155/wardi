"use client";

import { Bell, MapPin, MonitorSmartphone, Music, Volume2 } from "lucide-react";
import { Card, NumberField, SectionLabel, SegmentControl, Toggle } from "@/components/ui";
import { usePrayer } from "@/components/providers/PrayerProvider";
import { useLocale } from "@/lib/locale";
import { METHODS, PRAYERS_ADHAN, type AsrJuristic, type CalculationMethodId } from "@/lib/prayer";
import { ADHAN_SOUNDS } from "@/lib/prayerSettings";

export function PrayerSettingsPanel() {
  const { t } = useLocale();
  const {
    settings,
    updateSettings,
    locationStatus,
    requestLocation,
    testAdhan,
    testChime,
    stopPlayback,
    playing,
  } = usePrayer();

  return (
    <div className="mt-5 space-y-4">
      <SectionLabel>{t("settings.prayerSection")}</SectionLabel>

      <Card className="space-y-4 p-4">
        <Toggle
          checked={settings.enabled}
          onChange={(v) => updateSettings({ enabled: v })}
          label={t("settings.enablePrayer")}
          description={t("settings.enablePrayerDesc")}
        />

        {/* LOCATION */}
        <div className="rounded-2xl bg-surface-2 p-3.5">
          <Toggle
            checked={settings.autoLocation}
            onChange={(v) => {
              updateSettings({ autoLocation: v });
              if (v) requestLocation();
            }}
            label={t("settings.autoLocation")}
            description={t("settings.autoLocationDesc")}
          />
          {!settings.autoLocation && (
            <div className="mt-3 animate-fade-up grid grid-cols-2 gap-2 border-t border-line pt-3">
              <LatLngField
                label={t("settings.latitude")}
                value={settings.latitude}
                onChange={(v) => updateSettings({ latitude: v })}
              />
              <LatLngField
                label={t("settings.longitude")}
                value={settings.longitude}
                onChange={(v) => updateSettings({ longitude: v })}
              />
            </div>
          )}
          <button
            type="button"
            onClick={requestLocation}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-xs font-black text-muted transition active:scale-[0.98]"
          >
            <MapPin size={13} className="text-gold-strong" />
            {t("prayer.tapLocate")}
            {locationStatus === "loading" && <span className="text-gold-strong">{t("prayer.locating")}</span>}
            {locationStatus === "ok" && <span className="text-success">{t("prayer.autoLoc")}</span>}
            {locationStatus === "denied" && <span className="text-danger">{t("prayer.manualLoc")}</span>}
          </button>
        </div>
      </Card>

      {/* CALCULATION */}
      <Card className="space-y-4 p-4">
        <div>
          <FieldLabel icon={<MonitorSmartphone size={13} className="text-gold-strong" />} label={t("settings.method")} />
          <select
            value={settings.method}
            onChange={(e) => updateSettings({ method: e.target.value as CalculationMethodId })}
            className="mt-1.5 w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
          >
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {t(m.label)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel icon={<MonitorSmartphone size={13} className="text-gold-strong" />} label={t("settings.asr")} />
          <div className="mt-1.5">
            <SegmentControl<AsrJuristic>
              options={[
                { value: "standard", label: t("settings.asrStandard") },
                { value: "hanafi", label: t("settings.asrHanafi") },
              ]}
              value={settings.asr}
              onChange={(asr) => updateSettings({ asr })}
            />
          </div>
        </div>
      </Card>

      {/* SOUNDS */}
      <Card className="space-y-4 p-4">
        <div>
          <FieldLabel icon={<Music size={13} className="text-gold-strong" />} label={t("settings.adhanSound")} />
          <p className="mb-2 mt-0.5 text-xs text-muted">{t("settings.adhanSoundDesc")}</p>
          <div className="space-y-1.5">
            {ADHAN_SOUNDS.map((s) => {
              const selected = settings.adhanSoundId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => updateSettings({ adhanSoundId: s.id })}
                  className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-right transition active:scale-[0.99] ${
                    selected
                      ? "border-gold/60 bg-gold-soft"
                      : "border-line bg-surface-2 hover:bg-surface-3"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "border-gold bg-gold" : "border-line bg-surface"
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-primary-deep" />}
                  </span>
                  <span className={`flex-1 text-xs font-black ${selected ? "text-gold-strong" : "text-ink"}`}>
                    {t(s.label)}
                  </span>
                  {selected && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        void testAdhan("dhuhr");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold text-primary-deep"
                      aria-label={t("settings.testAdhan")}
                    >
                      <Volume2 size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Toggle
          checked={settings.adhanEnabled}
          onChange={(v) => updateSettings({ adhanEnabled: v })}
          label={t("settings.adhanEnabled")}
          description={t("settings.adhanEnabledDesc")}
        />
      </Card>

      {/* ALERTS */}
      <SectionLabel>{t("settings.prayerGroup")}</SectionLabel>
      <Card className="space-y-4 p-4">
        <Toggle
          checked={settings.preAdhanReminderEnabled}
          onChange={(v) => updateSettings({ preAdhanReminderEnabled: v })}
          label={t("settings.preReminder")}
          description={t("settings.preReminderDesc")}
        />
        {settings.preAdhanReminderEnabled && (
          <NumberField
            label={t("settings.preLead")}
            value={settings.preAdhanLeadMin}
            onChange={(v) => updateSettings({ preAdhanLeadMin: v })}
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
          />
        )}

        <Toggle
          checked={settings.reminderSoundEnabled}
          onChange={(v) => updateSettings({ reminderSoundEnabled: v })}
          label={t("settings.reminderSound")}
          description={t("settings.reminderSoundDesc")}
        />
      </Card>

      {/* SYSTEM NOTIFICATIONS */}
      <Card className="space-y-3 p-4">
        <Toggle
          checked={settings.browserNotifications}
          onChange={(v) => {
            updateSettings({ browserNotifications: v });
            if (v && "Notification" in window && Notification.permission === "default") {
              void Notification.requestPermission().then((perm) => {
                if (perm === "granted") updateSettings({ browserNotifications: true });
                else updateSettings({ browserNotifications: false });
              });
            }
          }}
          label={t("settings.systemNotifications")}
          description={t("settings.notificationsDesc")}
        />

        {/* TEST BUTTONS */}
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

function FieldLabel({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold text-muted">
      {icon}
      {label}
    </p>
  );
}

function LatLngField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        step="0.0001"
        value={Number(value.toFixed(4))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        dir="ltr"
        className="w-full rounded-xl bg-surface px-3 py-2.5 text-right text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}