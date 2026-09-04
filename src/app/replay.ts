/* Plays the last day in when the page opens, so the first thing anybody sees is the globe doing something.
   See ARCHITECTURE.md#srcappreplayts. */

/** Long enough to read as a day passing, short enough that nobody waits through it twice. */
export const REPLAY_SECONDS = 2.8;

/** The most history the entrance will play, however much is held. See ARCHITECTURE.md#srcappreplayts. */
export const REPLAY_SPAN_MS = 24 * 3_600_000;

/** Where the entrance should start, given the oldest thing held: the later of the buffer's start and a
 * day ago. */
export function replayFrom(oldest: number, now: number): number {
  return Math.max(oldest, now - REPLAY_SPAN_MS);
}

/**
 * Fronts are spawned only above this magnitude during the replay. A day holds several hundred events and a
 * front for each would be noise. See ARCHITECTURE.md#srcappreplayts.
 */
export const REPLAY_FRONT_MIN_MAG = 5;

export interface Replay {
  /** Origin time the replay has reached, or null once it is over. */
  at: () => number | null;
  /** Advances the clock. Returns the window `[previous, current]` that was just crossed. */
  step: (dt: number) => { from: number; to: number } | null;
  /** Ends it immediately, jumping to the present. Any interaction does this. */
  skip: () => void;
  done: () => boolean;
}

export interface ReplayOptions {
  /** Oldest origin time to start from. */
  from: number;
  /** Present. The replay ends here. */
  to: number;
  seconds?: number;
}

export function createReplay({ from, to, seconds = REPLAY_SECONDS }: ReplayOptions): Replay {
  /*
   * Eased, not linear. A linear sweep spends as long on the quiet hours as on a swarm, so it opens slowly
   * and blurs through the interesting part. Starting fast means the globe fills quickly and the last events
   * land at something close to the speed real ones will.
   */
  const ease = (t: number): number => 1 - (1 - t) ** 2.2;

  const span = Math.max(1, to - from);
  let elapsed = 0;
  let finished = from >= to;
  let current = from;

  return {
    at: () => (finished ? null : current),
    done: () => finished,
    skip: () => {
      finished = true;
      current = to;
    },
    step: (dt) => {
      if (finished) return null;
      const previous = current;
      elapsed += dt;
      const t = Math.min(1, elapsed / seconds);
      current = from + span * ease(t);
      if (t >= 1) {
        finished = true;
        current = to;
      }
      return { from: previous, to: current };
    },
  };
}
