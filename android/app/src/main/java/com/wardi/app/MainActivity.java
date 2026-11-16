package com.wardi.app;

import android.content.Intent;
import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Native TTS for the adhkar screen, the widget bridge and the widget
    // deep-link channel. Android System WebView has no Web Speech API, so the
    // TTS bridge is what makes automatic recitation work inside the app.
    registerPlugin(DhikrVoicePlugin.class);
    registerPlugin(WardiNavigationPlugin.class);
    registerPlugin(WardiWidgetPlugin.class);
    super.onCreate(savedInstanceState);
    // The mushaf reader hides the system bars from JS through Capacitor's
    // built-in SystemBars plugin. This behaviour lets an edge swipe reveal
    // them for a moment instead of leaving them pinned over the page.
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setSystemBarsBehavior(
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    handleWidgetIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    // Keep the activity's intent in sync so a widget tap while the app is
    // already open still reaches JS through the `launchRequest` event.
    setIntent(intent);
    handleWidgetIntent(intent);
  }

  /**
   * A home-screen widget fires an Intent with `wardi_open = "prayer"`. The
   * value is kept in {@link WardiLaunch} for the cold-start read and pushed to
   * the live JS listener for the warm-start case.
   */
  private void handleWidgetIntent(Intent intent) {
    if (intent == null) return;
    String screen = intent.getStringExtra("wardi_open");
    if (screen == null || screen.isEmpty()) return;
    // Consume it: a configuration change must not navigate again later.
    intent.removeExtra("wardi_open");
    WardiLaunch.current = screen;
    WardiNavigationPlugin.notifyLaunch(screen);
  }
}
