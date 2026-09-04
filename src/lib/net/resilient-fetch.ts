/**
 * Resilient fetch — timeout + retry wrapper for idempotent GET requests.
 *
 * Used for Quran.com API metadata and dataset fetches. Audio bytes played
 * through HTMLAudio are NOT piped through here (the media element manages
 * its own buffering; piping would be an architectural redesign).
 *
 * Contract:
 * - GET requests only (non-GET is rejected — retries are unsafe otherwise).
 * - Initial attempt + up to `retries` retries (default 2).
 * - Retryable: network failures, timeouts, HTTP 408 / 429 / 5xx.
 * - NOT retried: other 4xx responses (client errors won't heal by retrying).
 * - Offline short-circuit: when the browser reports offline, fail fast with
 *   kind "offline" without consuming retries.
 * - Backoff: min(maxDelayMs, baseDelayMs * 2^attempt) + jitter(rand * base).
 * - The original failure is always preserved on `error.cause`.
 *
 * Testability: fetch/sleep/random/online-check are injectable so unit tests
 * stay fast and deterministic (no real timers, no network).
 */

export type FetchErrorKind = "timeout" | "offline" | "http" | "network";

export class ResilientFetchError extends Error {
  readonly kind: FetchErrorKind;
  readonly status?: number;
  // No `override` modifier: the node test harness compiles under an older
  // lib target where Error declares no `cause` yet. The original failure
  // is always preserved here — never hidden.
  readonly cause?: unknown;

  constructor(kind: FetchErrorKind, message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = "ResilientFetchError";
    this.kind = kind;
    this.status = status;
    this.cause = cause;
  }
}

export interface ResilientFetchOptions {
  /** Per-attempt timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Max retries after the initial attempt. Default 2. */
  retries?: number;
  /** Base backoff delay in milliseconds. Default 500. */
  baseDelayMs?: number;
  /** Maximum backoff delay in milliseconds. Default 5000. */
  maxDelayMs?: number;
  /** Fetch implementation (injectable for tests). Default globalThis.fetch. */
  fetchFn?: typeof fetch;
  /** Sleep implementation (injectable for tests). */
  sleepFn?: (ms: number) => Promise<void>;
  /** Random source in [0, 1) for jitter (injectable for tests). */
  randFn?: () => number;
  /** Online check (injectable for tests). Default navigator.onLine ?? true. */
  onlineFn?: () => boolean;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

/** HTTP statuses worth retrying: 408, 429, and 5xx. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  rand: number
): number {
  const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return capped + rand * baseDelayMs;
}

export async function resilientFetch(
  input: string,
  opts: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    fetchFn = globalThis.fetch.bind(globalThis),
    sleepFn = defaultSleep,
    randFn = Math.random,
    onlineFn = defaultOnline,
  } = opts;

  if (!onlineFn()) {
    throw new ResilientFetchError(
      "offline",
      `Request aborted before sending (offline): ${input}`
    );
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(input, { signal: controller.signal });
      if (!res.ok) {
        const err = new ResilientFetchError(
          "http",
          `Request failed: ${res.status} ${res.statusText} (${input})`,
          res.status
        );
        if (!isRetryableStatus(res.status) || attempt === retries) {
          throw err;
        }
        lastError = err;
      } else {
        return res;
      }
    } catch (err) {
      if (err instanceof ResilientFetchError) {
        // HTTP errors carry their terminal/continue decision from above:
        // non-retryable statuses and exhausted retries arrive here as
        // throws and must propagate immediately, never be swallowed.
        throw err;
      } else if (err instanceof DOMException && err.name === "AbortError") {
        const timeoutErr = new ResilientFetchError(
          "timeout",
          `Request timed out after ${timeoutMs}ms (${input})`,
          undefined,
          err
        );
        if (attempt === retries) throw timeoutErr;
        lastError = timeoutErr;
      } else {
        // DNS failure, refused connection, captive portal, etc.
        const netErr = new ResilientFetchError(
          "network",
          `Network request failed (${input})`,
          undefined,
          err
        );
        if (attempt === retries) throw netErr;
        lastError = netErr;
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) {
      await sleepFn(computeBackoffDelay(attempt, baseDelayMs, maxDelayMs, randFn()));
    }
  }

  // Unreachable in practice (loop always returns or throws), but keeps
  // TypeScript and future edits honest without hiding the last failure.
  throw lastError instanceof ResilientFetchError
    ? lastError
    : new ResilientFetchError("network", `Request failed (${input})`, undefined, lastError);
}
