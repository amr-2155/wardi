package com.wardi.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Native bridge for the adhkar features.
 *
 * Android System WebView implements neither SpeechSynthesis nor the Web Speech
 * recognition API, so the web implementations silently do nothing inside the
 * Capacitor shell. This plugin wires the same contract to Android's own
 * TextToSpeech and SpeechRecognizer so recitation and the voice counter work
 * on the phone as well as in a desktop browser.
 */
@CapacitorPlugin(
    name = "DhikrVoice",
    permissions = {
      @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    })
public class DhikrVoicePlugin extends Plugin {

  private TextToSpeech tts;
  private boolean ttsReady = false;
  private final List<Runnable> pendingSpeak = new ArrayList<>();

  private SpeechRecognizer recognizer;
  private boolean listening = false;
  private String language = "ar-SA";
  private final Handler handler = new Handler(Looper.getMainLooper());

  private final RecognitionListener recognitionListener =
      new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {
          notifyListeners("state", new JSObject().put("listening", true));
        }

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onError(int error) {
          if (listening) {
            // Silence and timeouts are expected in a continuous session; keep
            // the microphone open instead of ending the counter.
            handler.postDelayed(DhikrVoicePlugin.this::restartRecognizer, 350);
          } else {
            notifyListeners("state", new JSObject().put("listening", false));
          }
          if (error != SpeechRecognizer.ERROR_NO_MATCH
              && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT
              && error != SpeechRecognizer.ERROR_CLIENT
              && error != SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
            notifyListeners(
                "error",
                new JSObject().put("code", error).put("message", errorName(error)));
          }
        }

        @Override
        public void onResults(Bundle results) {
          String text = firstResult(results);
          if (text != null) {
            notifyListeners("result", new JSObject().put("text", text).put("isFinal", true));
          }
          if (listening) {
            handler.postDelayed(DhikrVoicePlugin.this::restartRecognizer, 250);
          } else {
            notifyListeners("state", new JSObject().put("listening", false));
          }
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
          String text = firstResult(partialResults);
          if (text != null) {
            notifyListeners("result", new JSObject().put("text", text).put("isFinal", false));
          }
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}
      };

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
    boolean recognizerAvailable =
        SpeechRecognizer.isRecognitionAvailable(getContext());
    call.resolve(
        new JSObject()
            .put("available", recognizerAvailable || ttsReady)
            .put("tts", ttsReady)
            .put("recognizer", recognizerAvailable));
  }

  @PluginMethod
  public void listVoices(PluginCall call) {
    JSArray voices = new JSArray();
    if (tts != null) {
      try {
        for (Voice voice : tts.getVoices()) {
          voices.put(
              new JSObject()
                  .put("name", voice.getName())
                  .put("lang", voice.getLocale().toLanguageTag()));
        }
      } catch (RuntimeException ignored) {
        // Some engines expose no voices; the picker then simply stays hidden.
      }
    }
    call.resolve(new JSObject().put("voices", voices));
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
        () -> {
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
                    "dhikr-" + System.currentTimeMillis());
                call.resolve();
              });
        };

    if (ttsReady) task.run();
    else pendingSpeak.add(task);
  }

  @PluginMethod
  public void stopSpeaking(PluginCall call) {
    if (tts != null) tts.stop();
    call.resolve();
  }

  @PluginMethod
  public void startListening(PluginCall call) {
    if (getPermissionState("microphone") != PermissionState.GRANTED) {
      requestPermissionForAlias("microphone", call, "microphonePermission");
      return;
    }
    beginListening(call);
  }

  @PermissionCallback
  private void microphonePermission(PluginCall call) {
    if (getPermissionState("microphone") == PermissionState.GRANTED) {
      beginListening(call);
    } else {
      call.reject("microphone permission denied");
    }
  }

  private void beginListening(PluginCall call) {
    language = call.getString("lang", "ar-SA");
    listening = true;
    if (getActivity() != null) {
      getActivity().runOnUiThread(this::restartRecognizer);
    }
    call.resolve();
  }

  @PluginMethod
  public void stopListening(PluginCall call) {
    listening = false;
    handler.removeCallbacksAndMessages(null);
    if (getActivity() != null) {
      getActivity()
          .runOnUiThread(
              () -> {
                if (recognizer != null) {
                  try {
                    recognizer.cancel();
                  } catch (RuntimeException ignored) {
                    // Already idle.
                  }
                  recognizer.destroy();
                  recognizer = null;
                }
                notifyListeners("state", new JSObject().put("listening", false));
              });
    }
    call.resolve();
  }

  private void restartRecognizer() {
    if (!listening || getActivity() == null) return;
    if (recognizer == null) {
      recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
      recognizer.setRecognitionListener(recognitionListener);
    }
    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    intent.putExtra(
        RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
    intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
    intent.putExtra(
        RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600);
    try {
      recognizer.startListening(intent);
    } catch (RuntimeException error) {
      handler.postDelayed(this::restartRecognizer, 800);
    }
  }

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

  private static String firstResult(Bundle bundle) {
    if (bundle == null) return null;
    ArrayList<String> matches =
        bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
    if (matches == null || matches.isEmpty()) return null;
    return matches.get(0);
  }

  private static String errorName(int code) {
    switch (code) {
      case SpeechRecognizer.ERROR_AUDIO:
        return "audio";
      case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
        return "permissions";
      case SpeechRecognizer.ERROR_NETWORK:
        return "network";
      case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
        return "network-timeout";
      case SpeechRecognizer.ERROR_NO_MATCH:
        return "no-match";
      case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
        return "busy";
      case SpeechRecognizer.ERROR_SERVER:
        return "server";
      case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
        return "speech-timeout";
      default:
        return "unknown";
    }
  }

  @Override
  protected void handleOnPause() {
    if (tts != null) tts.stop();
    super.handleOnPause();
  }

  @Override
  protected void handleOnDestroy() {
    listening = false;
    handler.removeCallbacksAndMessages(null);
    if (recognizer != null) {
      recognizer.destroy();
      recognizer = null;
    }
    if (tts != null) {
      tts.stop();
      tts.shutdown();
      tts = null;
      ttsReady = false;
    }
    super.handleOnDestroy();
  }
}
