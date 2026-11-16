import { TAFSIR_SYSTEM_PROMPT_VERSION } from "./systemPrompt";
import type { TafsirProvider } from "./types";

/**
 * Optional remote provider.
 *
 * The app is a static, offline-first bundle, so it cannot hold a model API key
 * safely and must not call a vendor directly. Instead it talks to a trusted
 * proxy (deployed by the operator) via `NEXT_PUBLIC_TAFSIR_AI_URL`. When that
 * URL is unset — the default here — no provider exists and the UI stays on the
 * reviewed, offline path. This is a configuration surface, not a new route.
 */
const ENDPOINT = process.env.NEXT_PUBLIC_TAFSIR_AI_URL;

export function createRemoteProvider(): TafsirProvider | null {
  if (typeof ENDPOINT !== "string" || ENDPOINT.trim().length === 0) return null;
  const url = ENDPOINT.trim();
  return {
    id: "remote-proxy",
    enabled: true,
    async complete({ system, user }) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system, user, promptVersion: TAFSIR_SYSTEM_PROMPT_VERSION }),
      });
      if (!res.ok) throw new Error("tafsir provider HTTP " + res.status);
      return await res.text();
    },
  };
}
