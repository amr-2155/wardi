package com.wardi.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * 4×1 prayer strip: the five prayers with their times, next one highlighted.
 *
 * All three providers share one renderer, so a push aimed at any widget size
 * keeps every placed size in sync with the same app-computed schedule.
 */
public class WardiPrayerWidgetStrip extends AppWidgetProvider {

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
    WardiWidgetRenderer.updateAll(context);
    WardiWidgetScheduler.schedule(context);
  }

  @Override
  public void onEnabled(Context context) {
    WardiWidgetRenderer.updateAll(context);
    WardiWidgetScheduler.schedule(context);
  }
}
