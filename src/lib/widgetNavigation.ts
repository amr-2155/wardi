/**
 * Deep-link from a home-screen widget back into the right part of Wardi.
 *
 * The launcher widget's PendingIntent targets MainActivity with a string extra
 * (`wardi_open = "prayer"` today). Two paths deliver it:
 *
 *   1. launchScreen() — read once on mount; covers the "widget placed, app
 *      never started / killed" case.
 *   2. launchRequest events — MainActivity re-fires this on every new intent
 *      (warm start) and on every create with the extra, so a widget tap while
 *      the app is already open lands on the prayer screen immediately.
 *
 * Anything unrecognised is ignored, so the widget can never navigate the user
 * somewhere the app does not support.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export type LaunchScreen = "prayer";

interface WardiNavigationPlugin {
  launchScreen(): Promise<{ screen?: string | null }>;
  addListener(
    event: "launchRequest",
    listener: (data: { screen: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const nativeNav =
  typeof window !== "undefined" && Capacitor.isNativePlatform()
    ? registerPlugin<WardiNavigationPlugin>("WardiNavigation")
    : null;

/** The screen the app was launched with, or null. Never throws. */
export async function getLaunchScreen(): Promise<LaunchScreen | null> {
  if (!nativeNav) return null;
  try {
    const res = await nativeNav.launchScreen();
    return res?.screen === "prayer" ? "prayer" : null;
  } catch {
    return null;
  }
}

/** Listen for widget taps while the app is already running. */
export async function onLaunchRequest(
  listener: (screen: LaunchScreen) => void
): Promise<{ remove: () => void } | null> {
  if (!nativeNav) return null;
  try {
    const handle = await nativeNav.addListener("launchRequest", (data) => {
      if (data.screen === "prayer") listener("prayer");
    });
    return { remove: () => void handle.remove() };
  } catch {
    return null;
  }
}
