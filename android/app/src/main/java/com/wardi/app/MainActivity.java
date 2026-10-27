package com.wardi.app;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Native TTS + speech recognition for the adhkar screen. Android System
    // WebView has neither Web Speech API, so this bridge is what makes the
    // recitation and the voice counter work inside the app.
    registerPlugin(DhikrVoicePlugin.class);
    super.onCreate(savedInstanceState);
    // The mushaf reader hides the system bars from JS through Capacitor's
    // built-in SystemBars plugin. This behaviour lets an edge swipe reveal
    // them for a moment instead of leaving them pinned over the page.
    WindowInsetsControllerCompat controller =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    controller.setSystemBarsBehavior(
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
  }
}
