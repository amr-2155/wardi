package com.wardi.app;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Native bridge for the app's spoken sentences.
 *
 * Android System WebView has no SpeechSynthesis, so the web implementation does
 * nothing inside the Capacitor shell. This plugin wires the same contract to
 * Android's own TextToSpeech engine: the automatic reading of the hadith adhkar
 * (which have no verified reciter recording) and the prayer reminder.
 *
 * There is deliberately no speech recognition any more. The "count by voice"
 * button was removed from the adhkar screen, so keeping the microphone open —
 * and the RECORD_AUDIO permission with it — would have been dead weight and a
 * privacy cost with no feature behind it.
 */
@CapacitorPlugin(name = "DhikrVoice")
public class DhikrVoicePlugin extends Plugin {

  private TextToSpeech tts;
  private boolean ttsReady = false;
  private final List<Runnable> pendingSpeak = new ArrayList<>();
  private final Handler handler = new Handler(Looper.getMainLooper());

  @Override
  public void load() {
    tts =
        new TextToSpeech(
            getContext(),
            status -> {
              ttsReady = status == TextToSpeech.SUCCESS;
              if (ttsReady) {
                tts.setOnUtteranceProgressListener(
                    new UtteranceProgressListener() {
                      @Override
                      public void onStart(String utteranceId) {}

                      @Override
                      public void onDone(String utteranceId) {
                        notifyListeners("speakEnd", new JSObject());
                      }

                      @Override
                      public void onError(String utteranceId) {
                        notifyListeners("speakEnd", new JSObject());
                      }
                    });
              }
              List<Runnable> queued = new ArrayList<>(pendingSpeak);
              pendingSpeak.clear();
              for (Runnable task : queued) task.run();
            });
  }

  @PluginMethod
  public void isAvailable(PluginCall call) {
    call.resolve(new JSObject().put("available", ttsReady).put("tts", ttsReady));
  }

  @PluginMethod
  public void speak(PluginCall call) {
    String text = call.getString("text", "");
    if (text == null || text.trim().isEmpty()) {
      call.reject("empty text");
      return;
    }
    String lang = call.getString("lang", "ar-SA");
    Float rateValue = call.getFloat("rate");
    float rate = rateValue != null ? rateValue : 0.9f;
    String voiceName = call.getString("voice");

    Runnable task =
        () ->
            handler.post(
                () -> {
                  if (tts == null) {
                    call.resolve();
                    return;
                  }
                  tts.setLanguage(localeFor(lang));
                  tts.setSpeechRate(rate);
                  applyVoice(voiceName);
                  tts.speak(
                      text,
                      TextToSpeech.QUEUE_FLUSH,
                      null,
                      "speak-" + System.currentTimeMillis());
                  call.resolve();
                });

    if (ttsReady) task.run();
    else pendingSpeak.add(task);
  }

  @PluginMethod
  public void stopSpeaking(PluginCall call) {
    if (tts != null) tts.stop();
    call.resolve();
  }

  /**
   * A previously stored system-voice name is still honoured when it exists, so
   * a user who picked one before the picker was removed keeps that voice. An
   * unknown name simply falls back to the language default.
   */
  private void applyVoice(String name) {
    if (name == null || tts == null) return;
    try {
      for (Voice voice : tts.getVoices()) {
        if (name.equals(voice.getName())) {
          tts.setVoice(voice);
          return;
        }
      }
    } catch (RuntimeException ignored) {
      // Fall back to the language default.
    }
  }

  private static Locale localeFor(String tag) {
    try {
      Locale locale = Locale.forLanguageTag(tag);
      return locale == null || locale.getLanguage().isEmpty() ? new Locale("ar") : locale;
    } catch (RuntimeException ignored) {
      return new Locale("ar");
    }
  }

  @Override
  protected void handleOnPause() {
    if (tts != null) tts.stop();
    super.handleOnPause();
  }

  @Override
  protected void handleOnDestroy() {
    handler.removeCallbacksAndMessages(null);
    if (tts != null) {
      tts.stop();
      tts.shutdown();
      tts = null;
      ttsReady = false;
    }
    super.handleOnDestroy();
  }
}
