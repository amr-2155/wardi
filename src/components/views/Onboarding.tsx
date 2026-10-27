"use client";

import { Bell, BookOpen, Moon, Palette, Sparkles, Sun } from "lucide-react";
import { useState } from "react";
import { SegmentControl } from "@/components/ui";
import { useLocale } from "@/lib/locale";
import type { WardData } from "@/hooks/useWardData";
import type { ThemeMode } from "@/lib/types";
import { completeOnboarding } from "@/lib/onboarding";

const PAGE_CHOICES = [5, 10, 25, 50];

/**
 * First-launch setup overlay: daily pages → reminder time → theme.
 * Rendered by page.tsx only while onboarding is unseen; writes through the
 * same `WardData` setters Settings uses, so no second settings path exists.
 */
export function OnboardingOverlay({
  data,
  onDone,
}: {
  data: WardData;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const [step, setStep] = useState(0);
  const [pages, setPages] = useState(25);
  const [remind, setRemind] = useState(true);
  const [time, setTime] = useState(data.settings.reminderTime || "21:00");
  const [theme, setTheme] = useState<ThemeMode>(data.settings.theme);

  const finish = () => {
    data.updateSetting("baseDailyPages", Math.max(1, Math.round(pages)));
    data.updateSetting("dailyPages", Math.max(1, Math.round(pages)));
    data.updateSetting("notificationsEnabled", remind);
    if (remind) data.updateSetting("reminderTime", time);
    data.applyTheme(theme);
    data.rescheduleReminder();
    completeOnboarding();
    onDone();
  };

  const themes: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: t("onb.light"), icon: <Sun size={16} /> },
    { id: "dark", label: t("onb.dark"), icon: <Moon size={16} /> },
    { id: "system", label: t("onb.system"), icon: <Palette size={16} /> },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("onb.welcome")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-up sm:items-center"
    >
      <div className="w-full max-w-lg rounded-t-[28px] bg-bg p-6 pb-10 shadow-2xl animate-rise-in sm:rounded-[28px]">
        <div className="mx-auto mb-4 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-8 bg-gold" : "w-3 bg-line"
              }`}
            />
          ))}
        </div>

        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-gold-strong">
          <Sparkles size={12} />
          {t("onb.welcomeSub")}
        </div>
        <h2 className="display-md mb-4 text-ink">{t("onb.welcome")}</h2>

        {step === 0 && (
          <div className="animate-fade-up">
            <p className="mb-3 text-sm font-black text-ink">{t("onb.step1Title")}</p>
            <div className="grid grid-cols-4 gap-2">
              {PAGE_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPages(n)}
                  aria-pressed={pages === n}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 text-sm font-black transition active:scale-95 ${
                    pages === n
                      ? "border-gold bg-gold-soft text-gold-strong"
                      : "border-line bg-surface text-ink"
                  }`}
                >
                  <BookOpen size={15} />
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">{t("onb.pagesUnit")}</p>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-up">
            <p className="mb-1 text-sm font-black text-ink">{t("onb.step2Title")}</p>
            <p className="mb-3 text-[11px] text-muted">{t("onb.step2Sub")}</p>
            <div className="mb-3">
              <SegmentControl<"on" | "off">
                options={[
                  { value: "on", label: t("settings.reminder") },
                  { value: "off", label: t("onb.noReminder") },
                ]}
                value={remind ? "on" : "off"}
                onChange={(v) => setRemind(v === "on")}
              />
            </div>
            {remind && (
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  <Bell size={13} /> {t("settings.reminderTime")}
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-ink outline-none transition focus:ring-2 focus:ring-primary/40"
                />
              </label>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-up">
            <p className="mb-3 text-sm font-black text-ink">{t("onb.step3Title")}</p>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setTheme(th.id)}
                  aria-pressed={theme === th.id}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 text-xs font-black transition active:scale-95 ${
                    theme === th.id
                      ? "border-gold bg-gold-soft text-gold-strong"
                      : "border-line bg-surface text-ink"
                  }`}
                >
                  {th.icon}
                  {th.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="h-12 flex-1 rounded-2xl bg-surface-2 text-sm font-black text-ink transition active:scale-[0.98]"
            >
              {t("onb.back")}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="h-12 flex-[2] rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-md transition active:scale-[0.98]"
            >
              {t("onb.next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="h-12 flex-[2] rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-md transition active:scale-[0.98]"
            >
              {t("onb.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
