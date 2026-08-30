import { useEffect, useRef, useState } from "react";

/* Numbers that roll rather than jump. Only on a discrete change. A rolling readout eases toward a target,
   so pointing it at something already moving frame by frame - the replay, the cursor - makes it a late copy
   rather than a smooth one. See ARCHITECTURE.md. */

/**
 * How fast the gap closes, as the time constant of an exponential approach in milliseconds. See
 * ARCHITECTURE.md.
 */
export const ROLL_TAU_MS = 55;

/**
 * One step of the approach. Snaps inside half a unit rather than easing forever: an exponential never
 * formally arrives, and a count sitting at 872.4 renders as 872 while keeping a frame loop awake.
 */
export function stepToward(current: number, target: number, dtMs: number): number {
  if (!Number.isFinite(current)) return target;
  const gap = target - current;
  if (Math.abs(gap) < 0.5) return target;
  const closed = 1 - Math.exp(-Math.max(0, dtMs) / ROLL_TAU_MS);
  const next = current + gap * closed;
  // A step that would overshoot lands exactly, which an exponential cannot do but a large `dt` can: a
  // backgrounded tab wakes with hundreds of milliseconds in hand.
  return Math.abs(target - next) < 0.5 ? target : next;
}

/**
 * Whether a change is worth rolling at all. A first value has nothing to roll from, and easing up from zero
 * on load would invent a count-up the data never did. Reduced motion skips rather than shortens.
 */
export function shouldRoll(previous: number | null, reducedMotion: boolean): boolean {
  return previous !== null && !reducedMotion;
}

/** A number that eases to its target, or the target itself when it must not. See ARCHITECTURE.md. */
export function useRolling(value: number, live: boolean): number {
  const [shown, setShown] = useState(value);
  const previous = useRef<number | null>(null);
  const reduced = useRef(false);
  if (reduced.current === false && typeof window !== "undefined") {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (!live || !shouldRoll(from, reduced.current)) {
      setShown(value);
      return undefined;
    }

    let raf = 0;
    let last = performance.now();
    const frame = (at: number): void => {
      const dt = at - last;
      last = at;
      let done = false;
      setShown((current) => {
        const next = stepToward(current, value, dt);
        done = next === value;
        return next;
      });
      if (!done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, live]);

  // Rounded on the way out, never on the way through: rounding the state would quantise the approach into
  // whole steps and stall it whenever a frame moved it less than half a unit.
  return Math.round(shown);
}
