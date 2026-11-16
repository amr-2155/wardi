package com.wardi.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Address;
import android.location.Geocoder;

import org.json.JSONObject;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Turns the coordinates the app already synced into a place name the overview
 * widget can show.
 *
 * The name is a convenience only: the prayer times themselves always come from
 * the app. Geocoding is inherently network-bound, so it never runs on the sync
 * path — it is started in the background, cached in SharedPreferences per
 * (coordinates, language) and, when it finishes, the overview is redrawn. If
 * the device has no geocoder or is offline, the widget simply hides the
 * location line rather than inventing or guessing a city.
 */
final class WardiWidgetLocation {

  /** Rounded to ~110 m so a jittery fix still hits the cache. */
  private static String key(double latitude, double longitude, Locale locale) {
    return String.format(
        Locale.US, "geocode_%s_%.3f_%.3f", locale.getLanguage(), latitude, longitude);
  }

  /** The app's own language, so city names match the widget labels. */
  private static Locale localeOf(JSONObject payload) {
    String language = payload != null ? payload.optString("locale", "") : "";
    if ("ar".equals(language)) return new Locale("ar");
    if ("en".equals(language)) return Locale.ENGLISH;
    return Locale.getDefault();
  }

  private static double latitude(JSONObject payload) {
    return payload != null ? payload.optDouble("latitude", Double.NaN) : Double.NaN;
  }

  private static double longitude(JSONObject payload) {
    return payload != null ? payload.optDouble("longitude", Double.NaN) : Double.NaN;
  }

  /** Cached place name for the payload's coordinates, or "". */
  static String cached(Context context, JSONObject payload) {
    double lat = latitude(payload);
    double lng = longitude(payload);
    if (Double.isNaN(lat) || Double.isNaN(lng)) return "";
    String value = prefs(context).getString(key(lat, lng, localeOf(payload)), null);
    return value != null ? value : "";
  }

  /** True when the payload's coordinates still need a name for this language. */
  static boolean needsLookup(Context context, JSONObject payload) {
    double lat = latitude(payload);
    double lng = longitude(payload);
    if (Double.isNaN(lat) || Double.isNaN(lng)) return false;
    return !prefs(context).contains(key(lat, lng, localeOf(payload)));
  }

  /**
   * Resolve the payload's coordinates in the background, then redraw. Does
   * nothing when the answer is already cached or another lookup for the same
   * coordinates is in flight, so repeated syncs do not spawn duplicate work.
   */
  static void resolveAsync(Context context, JSONObject payload) {
    if (payload == null || !needsLookup(context, payload) || !Geocoder.isPresent()) return;

    final double lat = latitude(payload);
    final double lng = longitude(payload);
    final Locale locale = localeOf(payload);
    final String cacheKey = key(lat, lng, locale);
    if (!IN_FLIGHT.add(cacheKey)) return;

    final Context app = context.getApplicationContext();
    new Thread(
            new Runnable() {
              @Override
              public void run() {
                try {
                  Geocoder geocoder = new Geocoder(app, locale);
                  List<Address> found = geocoder.getFromLocation(lat, lng, 1);
                  if (found == null || found.isEmpty()) return;
                  Address address = found.get(0);
                  String name =
                      firstNonEmpty(
                          address.getLocality(),
                          address.getSubAdminArea(),
                          address.getAdminArea(),
                          address.getCountryName());
                  if (name == null) return;
                  prefs(app).edit().putString(cacheKey, name).apply();
                  WardiWidgetRenderer.updateAll(app);
                } catch (Exception ignored) {
                  /* offline / no service: the widget hides the line */
                } finally {
                  IN_FLIGHT.remove(cacheKey);
                }
              }
            },
            "wardi-geocode")
        .start();
  }

  private static final Set<String> IN_FLIGHT =
      Collections.synchronizedSet(new HashSet<String>());

  private static String firstNonEmpty(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(WardiWidgetRenderer.PREFS, Context.MODE_PRIVATE);
  }

  private WardiWidgetLocation() {}
}
