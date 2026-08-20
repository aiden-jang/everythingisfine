import { BUCKETS } from "./histogram";

/*
 * The window, as somewhere you can stand rather than only a total.
 *
 * The globe answers "where" completely, and since the activity strip it answers "when" as a shape.
 * What neither answers is "what did this look like an hour in": a sequence is a thing that unfolds,
 * and the app held a whole day of it and could only ever draw the end state. The entrance replay
 * shows that once, for 2.8 seconds, and then throws the ability away.
 *
 * So the cursor is the replay made permanent and steerable. It reuses the mechanism exactly: the
 * event layer already takes a `revealUntil` and draws only what had happened by then, because the
 * entrance needed it. Nothing here invents an event, reorders one or changes a time. The only thing
 * being decided is how far through the window the drawing stops.
 *
 * Kept out of the component, and out of React, because it is arithmetic with two traps in it and
 * both are easier to see written down than spread across an effect.
 */

/**
 * How long a play-through of the whole window takes, in seconds.
 *
 * Linear, and slower than the entrance replay's 2.8. The two look like the same motion and are not:
 * the entrance is scenery, watched once, and it eases so the globe fills fast and settles. This one
 * is being read on purpose, and easing a clock somebody is reading times off would misrepresent the
 * thing it is a clock for. Twelve seconds is slow enough to follow a sequence arriving and short
 * enough to sit through to the end.
 */
export const PLAY_SECONDS = 12;

export interface Scrub {
  /**
   * Origin time the cursor stands at, or null for live.
   *
   * Null is not "the right hand end". Live means no reveal limit at all, so an event that arrives
   * while somebody is watching appears; parked at the right hand end it would not, and the app would
   * quietly stop being live while looking exactly like it was.
   */
  at: number | null;
  playing: boolean;
}

export const LIVE: Scrub = { at: null, playing: false };

export interface Span {
  /** Oldest origin time the window covers. */
  from: number;
  /** The present. */
  to: number;
}

/** Where the cursor sits across the window, 0 at the old edge and 1 at now. Live reads as 1. */
export function fractionOf(scrub: Scrub, span: Span): number {
  if (scrub.at === null) return 1;
  const width = span.to - span.from;
  if (width <= 0) return 1;
  return Math.max(0, Math.min(1, (scrub.at - span.from) / width));
}

/** The cursor a fraction across the window puts it at, clamped into the span. */
export function atFraction(fraction: number, span: Span): number {
  const t = Math.max(0, Math.min(1, fraction));
  return span.from + (span.to - span.from) * t;
}

/**
 * Advances a playing cursor, and hands back to live when it catches up.
 *
 * Reaching the end returns to live rather than parking at `to`, for the reason on `at`: stopping one
 * pixel short of the present and calling it the present is how a live app stops being one. It also
 * means the control has an end, so playing to the finish leaves nothing to clear up.
 *
 * The span is passed in rather than remembered because `to` is the wall clock and moves underneath
 * this the whole time it runs.
 */
export function step(scrub: Scrub, span: Span, dt: number): Scrub {
  if (!scrub.playing || scrub.at === null) return scrub;
  const width = span.to - span.from;
  if (width <= 0) return LIVE;
  // `dt` is seconds and the window is milliseconds, so the rate is already the conversion. Writing
  // it with a further thousand in it ran a day's window out in eleven milliseconds.
  const next = scrub.at + (width / PLAY_SECONDS) * dt;
  if (next >= span.to) return LIVE;
  return { at: next, playing: true };
}

/**
 * What the play button does next.
 *
 * From live it starts at the old edge, because pressing play on a cursor that is already at the
 * present would be a no-op that looks like a broken button. From anywhere else it toggles in place.
 */
export function togglePlay(scrub: Scrub, span: Span): Scrub {
  if (scrub.at === null) return { at: span.from, playing: true };
  return { at: scrub.at, playing: !scrub.playing };
}

/** Dragging always pauses: a cursor that ran away from the pointer would be fighting it. */
export function dragTo(fraction: number, span: Span): Scrub {
  return { at: atFraction(fraction, span), playing: false };
}

/**
 * Keeps a cursor inside a window that has moved or changed size.
 *
 * Both happen constantly. `to` is the wall clock, and the window length is a control somebody can
 * change while parked in the middle of it. A cursor left outside its span reveals either nothing or
 * everything, and both look like the cursor broke rather than like the window moved.
 */
export function clamp(scrub: Scrub, span: Span): Scrub {
  if (scrub.at === null) return scrub;
  if (span.to <= span.from) return LIVE;
  if (scrub.at >= span.to) return LIVE;
  if (scrub.at < span.from) return { at: span.from, playing: scrub.playing };
  return scrub;
}

/**
 * Steps the cursor by whole buckets.
 *
 * A bucket rather than a fixed span, because the bucket is the unit the strip is drawn in and the
 * readout names. A key that moved the cursor by an hour would be a twenty-fourth of a day and a
 * seven-hundred-and-twentieth of a month, so one press would mean two different things depending on
 * a control somewhere else. Reading `BUCKETS` keeps the two in step by construction.
 *
 * No snapping to a boundary. The buckets are anchored to `now`, which moves continuously, so a grid
 * to snap onto slides out from under the cursor between one press and the next.
 *
 * From live, back is one bucket before the present, and forward has nothing to do: live is already
 * the right hand end. Jumping to the old edge is the other reading and it is what play does.
 *
 * A step forward that lands anywhere in the last bucket hands back to live, rather than only one
 * that overshoots `to`. The last bucket is the bucket ending now, so a cursor inside it reveals
 * everything and differs from live in one respect: an event arriving while you watch would not
 * appear. Without this, three steps back and three forward parked on the `to` of three presses ago,
 * which the wall clock has since moved past, and the app read as exactly live while saying held.
 *
 * Always pauses, for the reason `dragTo` does.
 */
export function nudge(scrub: Scrub, span: Span, buckets: number): Scrub {
  const width = span.to - span.from;
  if (width <= 0) return LIVE;
  const bucket = width / BUCKETS;
  if (scrub.at === null) {
    if (buckets >= 0) return LIVE;
    return { at: span.to - bucket * -buckets, playing: false };
  }
  const next = scrub.at + bucket * buckets;
  if (next >= span.to) return LIVE;
  if (buckets > 0 && next > span.to - bucket) return LIVE;
  return { at: Math.max(span.from, next), playing: false };
}
