"use client";

import { MapPin, MonitorSmartphone, Music, Volume2 } from "lucide-react";
import { Card, NumberField, SectionLabel, SegmentControl, Toggle } from "@/components/ui";
import { usePrayer } from "@/components/providers/PrayerProvider";
import { useLocale } from "@/lib/locale";
import { METHODS, type AsrJuristic, type CalculationMethodId } from "@/lib/prayer";
import { ADHAN_SOUNDS } from "@/lib/prayerSettings";

export function PrayerSettingsPanel() {
  const { t } = useLocale();
  const {
    settings,
    updateSettings,
    locationStatus,
    requestLocation,
    testAdhan,
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
                min={-90}
                max={90}
              />
              <LatLngField
                label={t("settings.longitude")}
                value={settings.longitude}
                onChange={(v) => updateSettings({ longitude: v })}
                min={-180}
                max={180}
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

function LatLngField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  /* Reuses NumberField so the same "clear the old value, type a new one"
     fix applies to coordinates too — the hand-rolled input here had the same
     controlled-value bug. */
  return (
    <NumberField
      label={label}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={0.0001}
      decimals={4}
    />
  );
}