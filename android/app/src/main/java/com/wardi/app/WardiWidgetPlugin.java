package com.wardi.app;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * Bridge between the app (the single source of truth for prayer times) and the
 * Android home-screen widgets.
 *
 * The web side computes the schedule with the same `adhan` code the in-app
 * screens use and hands it over as one JSON payload. This plugin only persists
 * that payload, redraws the widgets and re-arms the refresh alarm — it never
 * calculates a prayer time itself.
 */
@CapacitorPlugin(name = "WardiWidget")
public class WardiWidgetPlugin extends Plugin {

  @PluginMethod
  public void syncPrayerWidget(PluginCall call) {
    String payload = call.getString("payload");
    if (payload == null || payload.trim().isEmpty()) {
      call.reject("empty payload");
      return;
    }
    JSONObject parsed;
    try {
      parsed = new JSONObject(payload);
    } catch (Exception error) {
      call.reject("invalid payload");
      return;
    }
    if (parsed.optJSONArray("week") == null) {
      call.reject("payload has no schedule");
      return;
    }

    Context context = getContext();
    context
        .getSharedPreferences(WardiWidgetRenderer.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(WardiWidgetRenderer.KEY_PAYLOAD, payload)
        .apply();

    WardiWidgetRenderer.updateAll(context);
    WardiWidgetScheduler.schedule(context);
    /* The place name is optional and network-bound: never block the sync. */
    WardiWidgetLocation.resolveAsync(context, parsed);
    call.resolve();
  }

  /** Redraw from the last stored payload (locale/theme change, app resume). */
  @PluginMethod
  public void refreshWidgets(PluginCall call) {
    Context context = getContext();
    WardiWidgetRenderer.updateAll(context);
    WardiWidgetScheduler.schedule(context);
    call.resolve(new JSObject());
  }
}
