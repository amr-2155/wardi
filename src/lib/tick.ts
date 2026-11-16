/**
 * Dhikr feedback tones, synthesized with the Web Audio API — no audio assets,
 * no dependencies, works fully offline.
 *
 * There are two sounds on purpose:
 * - `playDhikrTap` is the soft tick for every repetition, quiet enough that a
 *   hundred of them read as counting rather than noise;
 * - `playDhikrFinal` is the distinct resolution for the LAST repetition of a
 *   dhikr, and `playDhikrComplete` the warmer chime for the end of a session.
 * Everything is best-effort — no AudioContext (SSR, old WebViews) or a throw
 * anywhere means silence, never a broken tap.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext;
    if (typeof AC !== "function") return null;
    if (!ctx) ctx = new AC();
    /* iOS/Safari (and the Android WebView) create the context suspended and
       only resume it on a gesture. Resuming is asynchronous, so returning null
       here would swallow the FIRST tap — the one the user is testing the button
       with. Resume and hand the context back; the blips scheduled while it is
       still suspended play as soon as it starts. */
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(ac: AudioContext, freq: number, at: number, dur: number, gain: number): void {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Rising two-tone chime for the last repetition of a counted dhikr. */
export function playDhikrComplete(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    blip(ac, 1568, t0, 0.1, 0.2);
    blip(ac, 2637, t0 + 0.09, 0.16, 0.2);
  } catch {
    /* Silence on any failure — the tap itself must never break. */
  }
}

/**
 * A single, soft tap tick. One tap = one dhikr, so the sound is one blip — a
 * hundred repetitions play a hundred quiet clicks, never a wall of noise. The
 * volume is deliberately low: it is confirmation, not a performance.
 */
export function playDhikrTap(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    blip(ac, 1240, t0, 0.05, 0.05);
  } catch {
    /* Silence on any failure — the tap itself must never break. */
  }
}

/**
 * The last repetition of a counted dhikr: a distinct, warmer three-tone
 * resolution. It is deliberately different from the completion chime, so the
 * ear can tell "this one is the last" from "the session is over" without
 * looking at the screen. Lower volume than the completion chime — the final
 * vibration is what carries the information.
 */
export function playDhikrFinal(): void {
  try {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    blip(ac, 1046, t0, 0.1, 0.07);
    blip(ac, 1318, t0 + 0.08, 0.12, 0.07);
    blip(ac, 2093, t0 + 0.18, 0.2, 0.07);
  } catch {
    /* Silence on any failure — the tap itself must never break. */
  }
}
