/**
 * Pure reload policy for the Quran dataset bundle.
 *
 * This module exists so the *semantics* of a coordinated reload are executable
 * under `node` and therefore testable, instead of being an untestable claim
 * about regex matches in a hook file. It has no React and no network import.
 *
 * Two independent hazards had to be closed here, and both are enforced by the
 * coordinator rather than by the caller remembering to be careful:
 *
 * 1. A coordinated reload fetches THREE resources (quran.json, hashes.json,
 *    ayah-meta.json). They finish at different times, and the big one finishes
 *    last. If each resource released the shared in-flight slot on its own, the
 *    first one to land would clear the guard while quran.json was still pending
 *    -- so a routine tab switch would start a second, duplicate full download.
 *    The rule is therefore: the slot is held until the WHOLE operation settles,
 *    exactly once, at one aggregate point (see runCoordinatedReload).
 *
 * 2. A superseded attempt settling late must never clear the slot that belongs
 *    to the newer attempt. `release()` is therefore ownership-scoped: it is a
 *    no-op unless this attempt is the one that currently holds the slot.
 */

export type DatasetUiStatus = "verified" | "hash-mismatch" | "offline" | "error";

/**
 * Only an outcome that is NOT proven good is worth retrying. A verified dataset
 * needs no work at all, and re-hashing a multi-megabyte file on every window
 * focus would be the classic waste.
 */
export function shouldReloadQuranData(status: DatasetUiStatus): boolean {
  return status !== "verified";
}

export interface AttemptOutcome {
  /** True when this attempt is still the current one and may write state. */
  current: boolean;
  /** True when this call is the one that retired the in-flight slot. */
  released: boolean;
}

export interface ReloadAttempt {
  /** The generation this attempt was minted with. Useful for assertions. */
  readonly attemptId: number;
  readonly settled: boolean;
  /** Retire the slot; apply the result only when `current` is true. */
  settle(): AttemptOutcome;
  /** Release the slot without applying anything (rejection path). */
  abandon(): AttemptOutcome;
}

export interface ReloadCoordinator {
  /** Mint an attempt, or `null` when a reload is genuinely already running. */
  start(): ReloadAttempt | null;
  /** Drop everything in flight (unmount / remount). Always succeeds. */
  cancel(): void;
  /** Diagnostics only. Never used for control flow. */
  attempts(): number;
  inFlight(): boolean;
  /** The attempt holding the slot, or null. */
  active(): ReloadAttempt | null;
}

export function createReloadCoordinator(): ReloadCoordinator {
  let generation = 0;
  let inFlight = false;
  let active: ReloadAttempt | null = null;

  /* Ownership-scoped: only the attempt that currently holds the slot may
     release it. A stale attempt calling settle() is a no-op here, which is
     what stops a late result from unlocking the guard for its replacement. */
  const release = (token: number): boolean => {
    if (token !== generation) return false;
    if (!inFlight) return false;
    inFlight = false;
    active = null;
    return true;
  };

  return {
    start(): ReloadAttempt | null {
      if (inFlight) return null;
      inFlight = true;
      generation += 1;
      const token = generation;
      let done = false;

      const attempt: ReloadAttempt = {
        attemptId: token,
        get settled() {
          return done;
        },
        settle(): AttemptOutcome {
          /* Idempotent: an attempt that already reported cannot apply or
             release anything a second time. */
          if (done) return { current: false, released: false };
          const current = token === generation;
          /* A stale attempt is told it is stale and stops there. It must not
             touch the slot now owned by a newer attempt. */
          const released = current ? release(token) : false;
          done = true;
          return { current, released };
        },
        abandon(): AttemptOutcome {
          if (done) return { current: false, released: false };
          const current = token === generation;
          const released = current ? release(token) : false;
          done = true;
          return { current, released };
        },
      };

      active = attempt;
      return attempt;
    },

    cancel(): void {
      /* Bumping the generation invalidates every outstanding attempt. The
         `settled` flag is deliberately NOT cleared: `cancel()` hands the slot
         to nobody, it does not hand it back. Whoever calls settle() next --
         possibly after a remount started a different attempt -- must not be
         able to retire that attempt's slot. That was exactly the wedge the
         unconditional release used to cause. */
      generation += 1;
      inFlight = false;
      active = null;
    },

    attempts: () => generation,
    inFlight: () => inFlight,
    active: () => active,
  };
}

/* ------------------------------------------------------------------ */
/* Coordinated three-resource reload                                   */
/* ------------------------------------------------------------------ */

export type ReloadResult<T> = { ok: true; value: T } | { ok: false; reason: unknown };

export interface CoordinatedReport<T> {
  applied: boolean;
  dataset: ReloadResult<T>;
  hashes: ReloadResult<string[]>;
  meta: ReloadResult<unknown>;
}

export type ResourceOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: unknown };

const toOutcome = <T,>(p: Promise<T>): Promise<ResourceOutcome<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (reason: unknown) => ({ ok: false as const, reason })
  );

/* An if/else rather than a ternary on `ok`: discriminant narrowing of a boolean
   literal is weaker when strictNullChecks is off, and this module is also
   compiled standalone by the test harness. */
const toResult = <R,>(r: ResourceOutcome<R>): ReloadResult<R> => {
  if (r.ok) return { ok: true, value: r.value };
  return { ok: false, reason: r.reason };
};

export interface CoordinatedOptions<T> {
  dataset: Promise<T>;
  hashes: Promise<string[]>;
  meta: Promise<unknown>;
  /** Called ONLY on the aggregate path, and only once. */
  onSettled?: () => void;
  /** Should the outcome be written to state? Default: attempt is current. */
  accept?: () => boolean;
}

/**
 * One logical reload attempt over three independent resources, with exactly one
 * settlement point.
 *
 * Guarantees:
 *  - The in-flight slot is held until ALL THREE resources settle. hashes.json
 *    landing early can no longer release the guard while quran.json pends.
 *  - `attempt.settle()` is called exactly once, after the last resource.
 *  - A rejection is a value, never an escape: `settle()` runs on every path, so
 *    a failed fetch cannot wedge the coordinator.
 *  - Whether the outcome is applied is decided exactly once, at the end, and is
 *    false for superseded attempts (or whenever `accept()` says no).
 *
 * Swallows nothing silently: rejections are returned as `{ok:false, reason}`
 * so the caller can surface a truthful error state instead of pretending the
 * load is still running.
 */
export async function runCoordinatedReload<T>(
  attempt: ReloadAttempt,
  options: CoordinatedOptions<T>
): Promise<CoordinatedReport<T>> {
  const [dataset, hashes, meta] = await Promise.all([
    toOutcome(options.dataset),
    toOutcome(options.hashes),
    toOutcome(options.meta),
  ]);

  /* `alive` is the mount guard and must be read at settlement time, not when
     the attempt was minted, so an unmount mid-load is still respected. */
  const accept = options.accept ?? (() => true);

  /* THE single settlement point. settle() retires the in-flight slot (and only
     the attempt that owns it), and reports whether this attempt is still the
     current one. `current` is false for a superseded attempt AND for a second
     call on an already-retired attempt, so it doubles as the idempotency
     guard. */
  const { current } = attempt.settle();
  const applied = current && accept();

  if (applied) options.onSettled?.();

  const out: CoordinatedReport<T> = {
    applied,
    dataset: toResult(dataset),
    hashes: toResult(hashes),
    meta: toResult(meta),
  };
  return out;
}

