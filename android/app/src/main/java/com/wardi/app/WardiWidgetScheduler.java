package com.wardi.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Wakes the widgets exactly when their content becomes wrong: at the next
 * prayer boundary (so the highlight and the countdown move on) and at local
 * midnight (so the date, the times and the "today" row roll over).
 *
 * The launcher's own 30-minute update period is the safety net; this alarm is
 * what makes the widget change on time rather than up to half an hour late.
 * It is deliberately inexact (`setAndAllowWhileIdle`, no exact-alarm
 * permission): prayer times are minute precision, and the OS may shift the
 * delivery by a small amount under Doze, which is acceptable for a widget.
 */
final class WardiWidgetScheduler {

  static final String ACTION_REFRESH = "com.wardi.app.action.REFRESH_WIDGETS";
  private static final int REQUEST = 4201;

  static void schedule(Context context) {
    AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms == null) return;
    PendingIntent pending = pending(context);
    alarms.cancel(pending);

    long now = System.currentTimeMillis();
    long trigger = nextBoundary(context, now);
    if (trigger <= 0) return;
    alarms.setAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP, Math.max(trigger, now + 10_000L), pending);
  }

  static void cancel(Context context) {
    AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms != null) alarms.cancel(pending(context));
  }

  private static PendingIntent pending(Context context) {
    Intent intent = new Intent(context, WardiWidgetRefresh.class).setAction(ACTION_REFRESH);
    return PendingIntent.getBroadcast(
        context,
        REQUEST,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  /** Earliest of the next prayer boundary and the next local midnight. */
  private static long nextBoundary(Context context, long now) {
    long midnight = nextMidnight(now);
    long change = midnight;
    long prayer = nextPrayerEpoch(context, now);
    if (prayer > 0 && prayer < change) change = prayer;
    return change;
  }

  private static long nextPrayerEpoch(Context context, long now) {
    try {
      String raw = context
          .getSharedPreferences(WardiWidgetRenderer.PREFS, Context.MODE_PRIVATE)
          .getString(WardiWidgetRenderer.KEY_PAYLOAD, null);
      if (raw == null) return -1L;
      JSONObject root = new JSONObject(raw);
      JSONArray week = root.optJSONArray("week");
      if (week == null) return -1L;
      /* Two days are enough: today's remaining prayers, else tomorrow's Fajr. */
      long best = -1L;
      for (int i = 0; i < week.length(); i += 1) {
        JSONObject row = week.optJSONObject(i);
        if (row == null) continue;
        JSONObject epochs = row.optJSONObject("epochs");
        if (epochs == null) continue;
        for (String key : WardiWidgetRenderer.ORDER) {
          long epoch = epochs.optLong(key, 0L);
          if (epoch > now + 2_000L && (best < 0L || epoch < best)) best = epoch;
        }
        if (best > 0L) break;
      }
      return best > 0L ? best + 2_000L : -1L;
    } catch (Exception ignored) {
      return -1L;
    }
  }

  private static long nextMidnight(long now) {
    Calendar calendar = Calendar.getInstance();
    calendar.setTimeInMillis(now);
    calendar.add(Calendar.DAY_OF_YEAR, 1);
    calendar.set(Calendar.HOUR_OF_DAY, 0);
    calendar.set(Calendar.MINUTE, 0);
    calendar.set(Calendar.SECOND, 2);
    calendar.set(Calendar.MILLISECOND, 0);
    return calendar.getTimeInMillis();
  }

  private WardiWidgetScheduler() {}
}
