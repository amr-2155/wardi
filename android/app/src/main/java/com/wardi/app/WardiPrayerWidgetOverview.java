package com.wardi.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * 4×3 overview: Hijri and Gregorian date, location, all five prayers with the
 * next one highlighted, sunrise in the footer.
 */
public class WardiPrayerWidgetOverview extends AppWidgetProvider {

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
