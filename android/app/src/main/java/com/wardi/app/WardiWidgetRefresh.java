package com.wardi.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Redraws the widgets when the OS tells us something time-related changed:
 * the alarm armed by {@link WardiWidgetScheduler}, a boot, a manual clock
 * change, a timezone change or a date rollover.
 *
 * Everything it needs is already stored in SharedPreferences, so this works
 * with the app closed. It always re-arms the next boundary before returning.
 */
public class WardiWidgetRefresh extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null) return;
    try {
      WardiWidgetRenderer.updateAll(context);
    } finally {
      /* Always re-arm, even if one layout failed to render. */
      WardiWidgetScheduler.schedule(context);
    }
  }
}
