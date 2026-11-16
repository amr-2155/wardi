package com.wardi.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * 4×2 next-prayer card: the next prayer, its time and the remaining time on
 * one side, all six times of the day on the other.
 */
public class WardiPrayerWidgetNext extends AppWidgetProvider {

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
