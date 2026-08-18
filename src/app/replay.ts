/*
 * The last day, played in.
 *
 * The wavefront is this product's signature and almost nobody ever saw one. Events arrive every few
 * minutes, so a person who opens the page, looks for ten seconds and leaves sees a static scatter of
 * dots and none of the motion the whole design is built around. Meanwhile the app is holding a
 * complete day of history and drawing all of it at once, flat, with its time dimension unused.
 *
 * So the entrance plays that day. Events appear in the order they happened, the larger ones send
 * their fronts out as they land, and the clock in the rail runs through the day while it happens.
 * By the time it settles into live mode the viewer has already seen what the globe does, and every
 * arrival afterwards reads as the same thing happening again rather than as an unexplained blip.
 *
 * It is a replay and it says so. Nothing here invents an event, reorders one, or changes a time:
 * the only thing being animated is *when the app chooses to draw* something it already has.
 */

/** Long enough to read as a day passing, short enough that nobody waits through it twice. */
export const REPLAY_SECONDS = 7;

/**
 * Fronts are spawned only above this magnitude during the replay.
 *
 * A day holds several hundred events and firing a front for each would be noise, not signal. Above
 * 4.5 a day yields something like fifteen to twenty-five worldwide, which lands as a rhythm.
 */
export const REPLAY_FRONT_MIN_MAG = 4.5;

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
   * Eased, not linear.
   *
   * A linear sweep spends the same time on the quiet hours as on a swarm, so it opens slowly and
   * then blurs through the interesting part. Starting fast and settling means the globe fills
   * quickly, which is what makes the first second worth watching, and the last events land at
   * something close to the speed real ones will.
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
