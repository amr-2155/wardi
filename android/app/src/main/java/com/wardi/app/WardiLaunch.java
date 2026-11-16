/**
 * Mutable holder for which screen the user launched with. MainActivity reads
 * the `wardi_open` intent extra and stores it here; the WardiNavigation
 * plugin hands it to JS on cold start, and a `launchRequest` listener covers
 * warm starts (tap while the app is already open).
 */
package com.wardi.app;

public final class WardiLaunch {
  public static volatile String current = null;

  private WardiLaunch() {}
}
