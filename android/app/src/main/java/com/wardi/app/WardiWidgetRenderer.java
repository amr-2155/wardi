package com.wardi.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Shared renderer for the three Wardi prayer widgets.
 *
 * The widget is a pure renderer. Every prayer time in the payload was computed
 * by the web app with the same `adhan` library and the same stored coordinates,
 * calculation method and madhab that the in-app screens use. This class only
 * decides which payload row is "today", which prayer is next, and how the
 * RemoteViews are filled — so the app and the widgets can never disagree about
 * a prayer time.
 *
 * The payload holds a rolling 14 days, each with pre-formatted display strings
 * (Arabic-Indic digits and ص/م already applied by the app) and epoch millis for
 * the next-prayer selection. A row is picked by its `dateKey`, which is why the
 * widgets keep working across midnight without re-opening the app. When the
 * payload has no row for today (first run, or more than 14 days stale) the
 * widget says "open Wardi to update" instead of showing a stale schedule as if
 * it were current.
 *
 * After Isha the next prayer is tomorrow's Fajr; the renderer crosses into the
 * following day's row for the "next prayer" panel only, and never relabels
 * today's grid with tomorrow's numbers.
 *
 * Tapping anywhere opens the prayer screen in the app (see {@link #bindClick}).
 */
public final class WardiWidgetRenderer {

  public static final String PREFS = "wardi_widget";
  public static final String KEY_PAYLOAD = "prayer_payload";

  /** Display order, including sunrise as the Fajr window boundary. */
  static final String[] ORDER = {"fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"};

  /* Wardi palette tokens, mirrored from src/app/globals.css. */
  private static final int PAPER_DARK = Color.rgb(0xE8, 0xEF, 0xE9);
  private static final int MUTED_DARK = Color.rgb(0x9A, 0xA8, 0x9F);
  private static final int ACCENT_DARK = Color.rgb(0xD9, 0xB3, 0x66);
  private static final int PAPER_LIGHT = Color.rgb(0x17, 0x38, 0x2D);
  private static final int MUTED_LIGHT = Color.rgb(0x5F, 0x6B, 0x64);
  private static final int ACCENT_LIGHT = Color.rgb(0x8A, 0x65, 0x23);

  private WardiWidgetRenderer() {}

  /** The five canonical prayers, in display order. */
  private static final String[] PRAYERS = {"fajr", "dhuhr", "asr", "maghrib", "isha"};

  /** Redraw every placed widget of the three sizes with the stored theme. */
  public static void updateAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    String payload = context
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_PAYLOAD, null);
    ComponentName[] targets = {
      new ComponentName(context, WardiPrayerWidgetStrip.class),
      new ComponentName(context, WardiPrayerWidgetNext.class),
      new ComponentName(context, WardiPrayerWidgetOverview.class),
    };
    for (ComponentName target : targets) {
      int layout = layoutFor(target.getClassName());
      for (int id : manager.getAppWidgetIds(target)) {
        try {
          manager.updateAppWidget(id, render(context, layout, payload));
        } catch (Exception e) {
          android.util.Log.e("WardiWidget", "render failed for " + target.getClassName(), e);
        }
      }
    }
  }

  private static int layoutFor(String className) {
    if (className.endsWith("WardiPrayerWidgetStrip")) return R.layout.wardi_widget_strip;
    if (className.endsWith("WardiPrayerWidgetNext")) return R.layout.wardi_widget_next;
    return R.layout.wardi_widget_overview;
  }

  private static String todayKey() {
    return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
  }

  /** Index of today's row, else the first future row, else -1. */
  private static int todayIndex(JSONArray week) {
    if (week == null) return -1;
    String today = todayKey();
    int firstFuture = -1;
    for (int i = 0; i < week.length(); i += 1) {
      JSONObject day = week.optJSONObject(i);
      if (day == null) continue;
      String key = day.optString("dateKey", "");
      if (today.equals(key)) return i;
      if (firstFuture < 0 && !key.isEmpty() && key.compareTo(today) > 0) firstFuture = i;
    }
    return firstFuture;
  }

  private static JSONObject rowAt(JSONArray week, int index) {
    if (week == null || index < 0 || index >= week.length()) return null;
    return week.optJSONObject(index);
  }

  private static RemoteViews render(Context context, int layout, String payloadText) {
    RemoteViews views = new RemoteViews(context.getPackageName(), layout);

    JSONObject root = null;
    try {
      if (payloadText != null) root = new JSONObject(payloadText);
    } catch (Exception ignored) {
      root = null;
    }
    JSONArray week = root != null ? root.optJSONArray("week") : null;
    int index = todayIndex(week);
    JSONObject today = rowAt(week, index);
    JSONObject tomorrow = rowAt(week, index + 1);

    long now = System.currentTimeMillis();
    Next next = findNext(today, tomorrow, now);
    boolean sameZone = root == null || zoneMatches(root);
    boolean fresh = sameZone && today != null && today.optJSONObject("times") != null && next != null;

    boolean dark = root == null || !"light".equals(root.optString("theme", "dark"));
    int paper = dark ? PAPER_DARK : PAPER_LIGHT;
    int muted = dark ? MUTED_DARK : MUTED_LIGHT;
    int accent = dark ? ACCENT_DARK : ACCENT_LIGHT;
    int bg = dark ? R.drawable.wardi_widget_bg_dark : R.drawable.wardi_widget_bg_light;
    int cell = dark ? R.drawable.wardi_widget_cell_dark : R.drawable.wardi_widget_cell_light;
    int highlight = dark
        ? R.drawable.wardi_widget_highlight_dark
        : R.drawable.wardi_widget_highlight_light;
    int line = dark ? R.drawable.wardi_widget_line_dark : R.drawable.wardi_widget_line_light;

    boolean arabic = root == null || !"en".equals(root.optString("locale", "ar"));
    JSONObject labels = root != null ? root.optJSONObject("labels") : null;

    views.setInt(R.id.wardi_root, "setBackgroundResource", bg);
    views.setInt(
        R.id.wardi_root,
        "setLayoutDirection",
        arabic ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);

    if (layout == R.layout.wardi_widget_strip) {
      bindStrip(views, fresh ? today : null, labels, next, fresh, paper, muted, accent, cell,
          highlight);
    } else if (layout == R.layout.wardi_widget_next) {
      bindNext(views, root, today, labels, next, fresh, now, paper, muted, accent, cell,
          highlight, line, context);
    } else {
      bindOverview(views, root, today, labels, next, fresh, paper, muted, accent, cell,
          highlight, line, context);
    }

    bindClick(context, views);
    return views;
  }

  /* ── Next prayer selection ── */

  /**
   * The schedule's display strings and date keys are only valid in the zone
   * they were computed in. After a flight (or a manual timezone change) the
   * widget would otherwise show the old city's times for the new local date,
   * so it reports "open Wardi" until the app recomputes.
   */
  private static boolean zoneMatches(JSONObject root) {
    String stored = root.optString("timeZone", "");
    if (stored.isEmpty()) return true;
    return stored.equals(java.util.TimeZone.getDefault().getID());
  }

  /** The next prayer after `now`, crossing into tomorrow after Isha. */
  private static final class Next {
    final String key;
    final String time;
    final long epoch;
    /** 0 = today's row, 1 = tomorrow's row. */
    final int dayOffset;

    Next(String key, String time, long epoch, int dayOffset) {
      this.key = key;
      this.time = time;
      this.epoch = epoch;
      this.dayOffset = dayOffset;
    }
  }

  private static Next findNext(JSONObject today, JSONObject tomorrow, long now) {
    Next next = scan(today, now, 0);
    if (next == null) next = scan(tomorrow, now, 1);
    return next;
  }

  private static Next scan(JSONObject row, long now, int dayOffset) {
    if (row == null) return null;
    JSONObject times = row.optJSONObject("times");
    JSONObject epochs = row.optJSONObject("epochs");
    if (times == null || epochs == null) return null;
    for (String key : ORDER) {
      long epoch = epochs.optLong(key, 0L);
      if (epoch > now) {
        String time = times.optString(key, "");
        if (time.isEmpty()) return null;
        return new Next(key, time, epoch, dayOffset);
      }
    }
    return null;
  }

  /* ── 4×1 strip: five prayers, name + time per column ── */

  private static void bindStrip(
      RemoteViews views,
      JSONObject today,
      JSONObject labels,
      Next next,
      boolean fresh,
      int paper,
      int muted,
      int accent,
      int cell,
      int highlight) {
    int[] cells = {
      R.id.strip_cell_fajr,
      R.id.strip_cell_dhuhr,
      R.id.strip_cell_asr,
      R.id.strip_cell_maghrib,
      R.id.strip_cell_isha,
    };
    int[] names = {
      R.id.strip_name_fajr,
      R.id.strip_name_dhuhr,
      R.id.strip_name_asr,
      R.id.strip_name_maghrib,
      R.id.strip_name_isha,
    };
    int[] times = {
      R.id.strip_time_fajr,
      R.id.strip_time_dhuhr,
      R.id.strip_time_asr,
      R.id.strip_time_maghrib,
      R.id.strip_time_isha,
    };
    JSONObject rowTimes = today != null ? today.optJSONObject("times") : null;

    for (int i = 0; i < PRAYERS.length; i += 1) {
      String key = PRAYERS[i];
      boolean isNext =
          fresh && next != null && next.dayOffset == 0 && next.key.equals(key);
      String label = label(labels, key);
      String time = fresh && rowTimes != null ? opt(rowTimes, key) : "—";
      views.setTextViewText(names[i], label);
      views.setTextViewText(times[i], time);
      views.setTextColor(names[i], isNext ? accent : muted);
      views.setTextColor(times[i], isNext ? accent : paper);
      views.setInt(cells[i], "setBackgroundResource", isNext ? highlight : cell);
    }
  }

  /* ── 4×2 next prayer: next + countdown on the left, all six times right ── */

  private static void bindNext(
      RemoteViews views,
      JSONObject root,
      JSONObject today,
      JSONObject labels,
      Next next,
      boolean fresh,
      long now,
      int paper,
      int muted,
      int accent,
      int cell,
      int highlight,
      int line,
      Context context) {
    JSONObject rowTimes = today != null ? today.optJSONObject("times") : null;

    int[] rows = {
      R.id.row_fajr,
      R.id.row_sunrise,
      R.id.row_dhuhr,
      R.id.row_asr,
      R.id.row_maghrib,
      R.id.row_isha,
    };
    int[] names = {
      R.id.row_name_fajr,
      R.id.row_name_sunrise,
      R.id.row_name_dhuhr,
      R.id.row_name_asr,
      R.id.row_name_maghrib,
      R.id.row_name_isha,
    };
    int[] times = {
      R.id.row_time_fajr,
      R.id.row_time_sunrise,
      R.id.row_time_dhuhr,
      R.id.row_time_asr,
      R.id.row_time_maghrib,
      R.id.row_time_isha,
    };

    for (int i = 0; i < ORDER.length; i += 1) {
      String key = ORDER[i];
      boolean isNext =
          fresh && next != null && next.dayOffset == 0 && next.key.equals(key);
      String time = fresh && rowTimes != null ? opt(rowTimes, key) : "—";
      views.setTextViewText(names[i], label(labels, key));
      views.setTextViewText(times[i], time);
      views.setTextColor(names[i], isNext ? accent : muted);
      views.setTextColor(times[i], isNext ? accent : paper);
      views.setInt(rows[i], "setBackgroundResource", isNext ? highlight : cell);
    }

    views.setTextViewText(R.id.next_label, context.getString(R.string.wardi_widget_next_title));
    views.setTextColor(R.id.next_label, muted);
    views.setInt(R.id.next_divider, "setBackgroundResource", line);

    if (!fresh) {
      /* Nothing honest to show: point at the app rather than inventing a time. */
      views.setTextViewText(
          R.id.next_name, context.getString(R.string.wardi_widget_open_short));
      views.setTextColor(R.id.next_name, accent);
      views.setTextViewText(R.id.next_time, "—");
      views.setTextColor(R.id.next_time, muted);
      views.setTextViewText(R.id.next_countdown, "");
      return;
    }

    boolean arabic = root == null || !"en".equals(root.optString("locale", "ar"));
    long remaining = Math.max(0L, (next.epoch - now) / 60000L);
    String countdown =
        context.getString(R.string.wardi_widget_next_label)
            + " "
            + durationText(remaining, arabic);

    views.setTextViewText(R.id.next_name, label(labels, next.key));
    views.setTextColor(R.id.next_name, accent);
    views.setTextViewText(R.id.next_time, next.time);
    views.setTextColor(R.id.next_time, paper);
    views.setTextViewText(R.id.next_countdown, countdown);
    views.setTextColor(R.id.next_countdown, accent);
  }

  /* ── 4×3 overview: dates + location + five columns + footer ── */

  private static void bindOverview(
      RemoteViews views,
      JSONObject root,
      JSONObject today,
      JSONObject labels,
      Next next,
      boolean fresh,
      int paper,
      int muted,
      int accent,
      int cell,
      int highlight,
      int line,
      Context context) {
    int[] cells = {
      R.id.ov_cell_fajr,
      R.id.ov_cell_dhuhr,
      R.id.ov_cell_asr,
      R.id.ov_cell_maghrib,
      R.id.ov_cell_isha,
    };
    int[] names = {
      R.id.ov_name_fajr,
      R.id.ov_name_dhuhr,
      R.id.ov_name_asr,
      R.id.ov_name_maghrib,
      R.id.ov_name_isha,
    };
    int[] times = {
      R.id.ov_time_fajr,
      R.id.ov_time_dhuhr,
      R.id.ov_time_asr,
      R.id.ov_time_maghrib,
      R.id.ov_time_isha,
    };
    JSONObject rowTimes = today != null ? today.optJSONObject("times") : null;

    for (int i = 0; i < PRAYERS.length; i += 1) {
      String key = PRAYERS[i];
      boolean isNext =
          fresh && next != null && next.dayOffset == 0 && next.key.equals(key);
      String time = fresh && rowTimes != null ? opt(rowTimes, key) : "—";
      views.setTextViewText(names[i], label(labels, key));
      views.setTextViewText(times[i], time);
      views.setTextColor(names[i], isNext ? accent : muted);
      views.setTextColor(times[i], isNext ? accent : paper);
      views.setInt(cells[i], "setBackgroundResource", isNext ? highlight : cell);
    }

    /* Header dates come from the same payload row the times came from, so a
       date rollover at midnight moves the header and the schedule together. */
    String hijri = today != null ? today.optString("hijri", "") : "";
    String gregorian = today != null ? today.optString("gregorian", "") : "";
    if (fresh && hijri.isEmpty() && root != null) hijri = root.optString("hijri", "");
    if (fresh && gregorian.isEmpty() && root != null) gregorian = root.optString("gregorian", "");

    if (!fresh) {
      /* No usable schedule: say so instead of showing an empty-looking card. */
      views.setTextViewText(R.id.ov_hijri, context.getString(R.string.wardi_widget_open));
      views.setTextColor(R.id.ov_hijri, muted);
      views.setTextViewText(R.id.ov_gregorian, "");
    } else {
      views.setTextViewText(R.id.ov_hijri, hijri);
      views.setTextColor(R.id.ov_hijri, paper);
      views.setTextViewText(R.id.ov_gregorian, gregorian);
      views.setTextColor(R.id.ov_gregorian, muted);
    }
    views.setInt(R.id.ov_divider, "setBackgroundResource", line);

    String location = fresh ? WardiWidgetLocation.cached(context, root) : "";
    if (location.isEmpty()) {
      views.setViewVisibility(R.id.ov_location_row, View.GONE);
    } else {
      views.setViewVisibility(R.id.ov_location_row, View.VISIBLE);
      views.setTextViewText(R.id.ov_location, location);
      views.setTextColor(R.id.ov_location, paper);
    }

    String sunrise =
        label(labels, "sunrise") + "  " + (fresh && rowTimes != null ? opt(rowTimes, "sunrise") : "—");
    views.setTextViewText(R.id.ov_sunrise, sunrise);
    views.setTextColor(R.id.ov_sunrise, muted);
    views.setTextViewText(R.id.ov_cta, context.getString(R.string.wardi_widget_view_all));
    views.setTextColor(R.id.ov_cta, accent);
  }

  /* ── Shared ── */

  private static void bindClick(Context context, RemoteViews views) {
    Intent intent = new Intent(context, MainActivity.class);
    intent.putExtra("wardi_open", "prayer");
    intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pending =
        PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.wardi_root, pending);
  }

  private static String label(JSONObject labels, String key) {
    String value = labels != null ? labels.optString(key, "") : "";
    return value.isEmpty() ? defaultLabel(key) : value;
  }

  private static String opt(JSONObject obj, String key) {
    String value = obj != null ? obj.optString(key, "") : "";
    return value.isEmpty() ? "—" : value;
  }

  private static String defaultLabel(String key) {
    switch (key) {
      case "fajr": return "الفجر";
      case "sunrise": return "الشروق";
      case "dhuhr": return "الظهر";
      case "asr": return "العصر";
      case "maghrib": return "المغرب";
      default: return "العشاء";
    }
  }

  /** "متبقي ساعة و٢٠ دقيقة" / "1 hr 20 min", honest Arabic plural forms. */
  static String durationText(long totalMinutes, boolean arabic) {
    if (totalMinutes <= 0) return arabic ? "الآن" : "now";
    long hours = totalMinutes / 60L;
    long minutes = totalMinutes % 60L;
    if (!arabic) {
      if (hours <= 0) return minutes + " min";
      return hours + " hr" + (minutes > 0 ? " " + minutes + " min" : "");
    }
    StringBuilder out = new StringBuilder();
    if (hours > 0) out.append(hoursWord(hours));
    if (minutes > 0) {
      if (out.length() > 0) out.append(" و");
      out.append(minutesWord(minutes));
    }
    return out.toString();
  }

  private static String hoursWord(long n) {
    if (n == 1) return "ساعة";
    if (n == 2) return "ساعتان";
    if (n <= 10) return arabicDigits(n) + " ساعات";
    return arabicDigits(n) + " ساعة";
  }

  private static String minutesWord(long n) {
    if (n == 1) return "دقيقة";
    if (n == 2) return "دقيقتان";
    if (n <= 10) return arabicDigits(n) + " دقائق";
    return arabicDigits(n) + " دقيقة";
  }

  private static String arabicDigits(long n) {
    String digits = String.valueOf(n);
    StringBuilder out = new StringBuilder(digits.length());
    for (int i = 0; i < digits.length(); i += 1) {
      char c = digits.charAt(i);
      if (c >= '0' && c <= '9') out.append("٠١٢٣٤٥٦٧٨٩".charAt(c - '0'));
      else out.append(c);
    }
    return out.toString();
  }
}
