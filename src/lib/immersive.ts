import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Android system bars for the mushaf reader only.
 *
 * Capacitor 8 ships the `SystemBars` plugin inside its core Android runtime
 * (`com.getcapacitor.plugin.SystemBars`, registered automatically), so hiding
 * the real status and navigation bars needs no third-party package and no
 * custom native code. `MainActivity` only sets the "reveal transiently by
 * swipe" behaviour so a system gesture shows the bars for a moment instead of
 * pinning them there.
 *
 * This is deliberately not a global setting: the reader calls it on mount and
 * restores the bars on unmount, so every other Wardi screen keeps its status
 * bar. On the web (and on any build without the plugin) it is a no-op.
 */
interface SystemBarsPlugin {
  show(options?: { bar?: "StatusBar" | "NavigationBar" }): Promise<void>;
  hide(options?: { bar?: "StatusBar" | "NavigationBar" }): Promise<void>;
}

const systemBars =
  typeof window !== "undefined" && Capacitor.isNativePlatform()
    ? registerPlugin<SystemBarsPlugin>("SystemBars")
    : null;

/** Hide the system bars (true) or give them back (false). Never throws. */
export function setImmersive(enabled: boolean): void {
  const plugin = systemBars;
  if (!plugin) return;
  const call = enabled ? plugin.hide({}) : plugin.show({});
  void call.catch(() => {
    /* An older runtime without the plugin simply keeps its system bars. */
  });
}
