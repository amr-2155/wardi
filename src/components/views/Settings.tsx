"use client";

import { Bell, BookOpen, Database, Download, Palette, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Card, NumberField, SectionLabel, SegmentControl, Toggle } from "@/components/ui";
import type { ThemeMode } from "@/lib/types";
import type { WardData } from "@/hooks/useWardData";

export function SettingsView({ data }: { data: WardData }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<"ok" | "error" | null>(null);
  const auto = data.settings.autoIncrease;

  const handleExport = () => {
    const blob = new Blob([data.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wardi-backup-${data.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const ok = data.importJSON(text);
    setImportStatus(ok ? "ok" : "error");
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 pt-6">
      <h2 className="text-2xl font-black">الإعدادات</h2>

      {/* WARD */}
      <SectionLabel>وردي</SectionLabel>
      <Card className="space-y-4 p-4">
        <NumberField
          label="آخر صفحة وصلت إليها"
          value={data.settings.currentPage}
          onChange={(v) => data.updateSetting("currentPage", Math.min(data.settings.totalPages, v))}
        />
        {auto ? (
          <NumberField
            label="الورد الأساسي عند بداية الجدول"
            value={data.settings.baseDailyPages}
            onChange={(v) => data.updateSetting("baseDailyPages", v)}
          />
        ) : (
          <NumberField
            label="الورد الحالي الثابت"
            value={data.settings.dailyPages}
            onChange={(v) => data.updateSetting("dailyPages", v)}
          />
        )}
      </Card>

      {/* DEVELOPMENT */}
      <div className="mt-5">
        <SectionLabel>تطوير الورد</SectionLabel>
        <Card className="p-4">
          <Toggle
            checked={auto}
            onChange={() => data.toggleAutoIncrease()}
            label="الزيادة التلقائية"
            description="يزداد وردك تلقائيًا حسب الجدول الزمني"
          />
          {auto && (
            <div className="mt-4 animate-fade-up space-y-4 border-t border-line pt-4">
              <NumberField
                label="كم صفحة تزيد كل مرة؟"
                value={data.settings.increaseAmount}
                onChange={(v) => data.updateSetting("increaseAmount", v)}
              />
              <NumberField
                label="كل كم يوم تزيد؟"
                value={data.settings.increaseEveryDays}
                onChange={(v) => data.updateSetting("increaseEveryDays", v)}
              />
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-muted">بداية الجدول</span>
                <input
                  type="date"
                  value={data.settings.increaseStartDate}
                  onChange={(e) => data.updateSetting("increaseStartDate", e.target.value)}
                  className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <div className="rounded-2xl bg-primary-soft p-4">
                <p className="text-[10px] text-muted">وردك اليوم المحسوب</p>
                <p className="text-lg font-black">{data.dailyPages} صفحة</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  أساسي {data.settings.baseDailyPages} + تطور حسب الجدول
                </p>
              </div>
            </div>
          )}
          <div className="mt-4 animate-fade-up space-y-4 border-t border-line pt-4">
            <Toggle
              checked={data.settings.khatmaIncreaseEnabled}
              onChange={(v) => data.updateSetting("khatmaIncreaseEnabled", v)}
              label="الزيادة عند إتمام الختمة"
              description="يزداد وردك بعدد صفحات عند إكمال كل ختمة"
            />
            {data.settings.khatmaIncreaseEnabled && (
              <NumberField
                label="كم صفحة تزيد عند كل ختمة؟"
                value={data.settings.khatmaIncreaseAmount}
                onChange={(v) => data.updateSetting("khatmaIncreaseAmount", v)}
              />
            )}
          </div>
        </Card>
      </div>

      {/* QURAN */}
      <div className="mt-5">
        <SectionLabel>المصحف</SectionLabel>
        <Card className="p-4">
          <NumberField
            label="عدد صفحات المصحف"
            value={data.settings.totalPages}
            onChange={(v) => data.updateSetting("totalPages", v)}
          />
        </Card>
      </div>

      {/* APPEARANCE */}
      <div className="mt-5">
        <SectionLabel>المظهر</SectionLabel>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Palette size={16} className="text-gold-strong" />
            المظهر
          </div>
          <SegmentControl<ThemeMode>
            options={[
              { value: "light", label: "فاتح" },
              { value: "dark", label: "داكن" },
              { value: "system", label: "تلقائي" },
            ]}
            value={data.settings.theme}
            onChange={(theme) => data.applyTheme(theme)}
          />
        </Card>
      </div>

      {/* NOTIFICATIONS */}
      <div className="mt-5">
        <SectionLabel>الإشعارات</SectionLabel>
        <Card className="p-4">
          <Toggle
            checked={data.settings.notificationsEnabled}
            onChange={(v) => data.updateSetting("notificationsEnabled", v)}
            label="تذكير بورد اليوم"
            description="تنبيه يومي لقراءة وردك"
          />
          {data.settings.notificationsEnabled && (
            <div className="mt-4 animate-fade-up border-t border-line pt-4">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  <Bell size={13} /> وقت التذكير
                </span>
                <input
                  type="time"
                  value={data.settings.reminderTime}
                  onChange={(e) => data.updateSetting("reminderTime", e.target.value)}
                  className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <p className="mt-2 text-[10px] text-muted">
                يعمل داخل المتصفح عند فتحه، وقد لا يكون متاحًا على كل الأجهزة.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* DATA */}
      <div className="mt-5">
        <SectionLabel>البيانات</SectionLabel>
        <Card className="space-y-3 p-4">
          <button
            type="button"
            onClick={handleExport}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-xs font-bold transition active:scale-[0.98]"
          >
            <Download size={16} /> تصدير نسخة احتياطية
          </button>
          <button
            type="button"
            onClick={() => {
              setImportStatus(null);
              fileRef.current?.click();
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-xs font-bold transition active:scale-[0.98]"
          >
            <Upload size={16} /> استيراد نسخة احتياطية
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          {importStatus === "ok" && (
            <p className="text-center text-[11px] font-bold text-success">تم الاستيراد بنجاح ✓</p>
          )}
          {importStatus === "error" && (
            <p className="text-center text-[11px] font-bold text-danger">ملف غير صالح</p>
          )}
          <div className="flex items-center gap-2 border-t border-line pt-3 text-[10px] text-muted">
            <Database size={13} />
            بياناتك محفوظة محليًا على جهازك فقط
          </div>
        </Card>
      </div>

      {/* DANGER */}
      <div className="mt-5">
        <Card className="border border-danger/20 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-danger">
            <Trash2 size={16} />
            منطقة الخطر
          </div>
          <button
            type="button"
            onClick={data.resetApp}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-danger-soft text-xs font-bold text-danger transition active:scale-[0.98]"
          >
            <Trash2 size={16} /> حذف جميع البيانات
          </button>
        </Card>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted">
        <BookOpen size={12} className="text-gold-strong" />
        وردي — مساعدك لمتابعة وردك اليومي وقراءة القرآن
      </p>
    </div>
  );
}
