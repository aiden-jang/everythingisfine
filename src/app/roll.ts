import { useEffect, useRef, useState } from "react";

/*
 * Numbers that roll rather than jump.
 *
 * The rail has one focal point and it is the count. It moves for three different reasons and only one of
 * them looked like anything: the entrance replay already climbs it, because the replay drives it a frame
 * at a time. A live arrival snaps it by one, and changing the window snaps it from 872 to 11,363, which
 * is the app's largest single change of state rendered as a flicker.
 *
 * **Only ever on a discrete change, and this is the constraint the whole thing turns on.** A rolling
 * readout eases toward a target, so pointing it at a continuously moving source makes it a permanently
 * late reading of that source rather than a smooth one. The cursor drives this count continuously while
 * it is parked or playing, and the replay does the same on the way in. In both cases the number must be
 * exactly what is drawn, so the roll is off and the value is taken as given.
 */

/**
 * How fast the gap closes, as the time constant of an exponential approach in milliseconds.
 *
 * Exponential rather than a fixed duration, because the distances differ by four orders of magnitude:
 * an arrival moves the count by one and a window change moves it by ten thousand. A fixed duration
 * either crawls through the small case or blurs the large one.
 *
 * The value is solved rather than chosen. Time to land is `tau * ln(gap / 0.5)`, so the largest change
 * the app makes, 872 to 11,363 when the window widens, costs about ten time constants. 55ms puts that
 * at 547ms and a single arrival at 38ms, which is a snap. The first guess of 120ms measured at 1,194ms
 * for the same jump: over a second of digits still turning, which is a readout arguing with itself.
 */
export const ROLL_TAU_MS = 55;

/**
 * One step of the approach.
 *
 * Snaps inside half a unit rather than easing forever. An exponential never formally arrives, and a
 * count that sits at 872.4 forever is a count that renders as 872 while claiming to still be moving,
 * which keeps a frame loop awake for nothing.
 */
export function stepToward(current: number, target: number, dtMs: number): number {
  if (!Number.isFinite(current)) return target;
  const gap = target - current;
  if (Math.abs(gap) < 0.5) return target;
  const closed = 1 - Math.exp(-Math.max(0, dtMs) / ROLL_TAU_MS);
  const next = current + gap * closed;
  // A step that would overshoot lands exactly, which an exponential cannot do but a large `dt` can:
  // a backgrounded tab wakes with hundreds of milliseconds in hand.
  return Math.abs(target - next) < 0.5 ? target : next;
}

/**
 * Whether a change is worth rolling at all.
 *
 * A first value has nothing to roll from: easing up from zero on load would invent a count-up the data
 * never did, and the entrance replay already owns that moment. Reduced motion skips rather than
 * shortens, which is the rule the camera and the entrance both follow.
 */
export function shouldRoll(previous: number | null, reducedMotion: boolean): boolean {
  return previous !== null && !reducedMotion;
}

/**
 * A number that eases to its target, or the target itself when it must not.
 *
 * `live` is the switch the module's own note is about: pass false whenever something else is driving
 * this value a frame at a time, and the value passes straight through. The cursor and the entrance
 * replay both do that, and easing on top of either makes the readout a late copy of a number that is
 * already correct on screen.
 *
 * Its own frame loop, started on a change and stopped on arrival, because the app's convention is that
 * nothing animates while nothing is happening.
 */
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

  // Rounded on the way out, never on the way through: rounding the state would quantise the approach
  // into whole steps and stall it whenever a frame moved it less than half a unit.
  return Math.round(shown);
}
