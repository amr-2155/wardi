package com.wardi.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

/**
 * Native bridge that lets the home-screen widgets deep-link into a section of
 * the app (the prayer view today).
 *
 * Two delivery paths cover both launch modes:
 * - {@link #launchScreen(PluginCall)} — read once on mount; that covers the
 *   cold start where the process was created by the widget tap.
 * - the `launchRequest` event — fired from MainActivity on every intent —
 *   covers the warm start where the app is already running.
 *
 * Any value the web layer does not recognise is ignored, so the widget can
 * never navigate the user somewhere the app does not support.
 */
@CapacitorPlugin(name = "WardiNavigation")
public class WardiNavigationPlugin extends Plugin {

  private static WeakReference<WardiNavigationPlugin> instance = new WeakReference<>(null);

  @Override
  public void load() {
    super.load();
    instance = new WeakReference<>(this);
  }

  @PluginMethod
  public void launchScreen(PluginCall call) {
    JSObject result = new JSObject();
    result.put("screen", WardiLaunch.current != null ? WardiLaunch.current : "");
    call.resolve(result);
  }

  /** Called by MainActivity with the incoming intent's `wardi_open` extra. */
  static void notifyLaunch(String screen) {
    JSObject data = new JSObject();
    data.put("screen", screen != null ? screen : "");
    WardiNavigationPlugin ref = instance.get();
    if (ref != null) {
      ref.notifyListeners("launchRequest", data);
    }
  }
}
