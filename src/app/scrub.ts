import { BUCKETS } from "./histogram";

/* The window, as somewhere you can stand rather than only a total. See ARCHITECTURE.md. */

/**
 * How long a play-through of the whole window takes, in seconds. Linear, and slower than the entrance
 * replay's 2.8: that one is scenery watched once, and easing a clock somebody is reading times off would
 * misrepresent the thing it is a clock for.
 */
export const PLAY_SECONDS = 12;

export interface Scrub {
  /** Origin time the cursor stands at, or null for live. Null is not "the right hand end": live means no
   * reveal limit, so an event arriving while somebody watches appears. Parked at the end it would not, and
   * the app would quietly stop being live while looking exactly like it was. */
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
 * Advances a playing cursor, and hands back to live when it catches up. Stopping one pixel short of the
 * present and calling it the present is how a live app stops being one. See ARCHITECTURE.md.
 */
export function step(scrub: Scrub, span: Span, dt: number): Scrub {
  if (!scrub.playing || scrub.at === null) return scrub;
  const width = span.to - span.from;
  if (width <= 0) return LIVE;
  // `dt` is seconds and the window is milliseconds, so the rate is already the conversion. A further
  // thousand in it ran a day's window out in eleven milliseconds.
  const next = scrub.at + (width / PLAY_SECONDS) * dt;
  if (next >= span.to) return LIVE;
  return { at: next, playing: true };
}

/** What the play button does next. From live it starts at the old edge, because pressing play on a cursor
 * already at the present would be a no-op that looks like a broken button. */
export function togglePlay(scrub: Scrub, span: Span): Scrub {
  if (scrub.at === null) return { at: span.from, playing: true };
  return { at: scrub.at, playing: !scrub.playing };
}

/** Dragging always pauses: a cursor that ran away from the pointer would be fighting it. */
export function dragTo(fraction: number, span: Span): Scrub {
  return { at: atFraction(fraction, span), playing: false };
}

/**
 * Keeps a cursor inside a window that has moved or changed size. Both happen constantly. A cursor left
 * outside its span reveals either nothing or everything, and both look like the cursor broke.
 */
export function clamp(scrub: Scrub, span: Span): Scrub {
  if (scrub.at === null) return scrub;
  if (span.to <= span.from) return LIVE;
  if (scrub.at >= span.to) return LIVE;
  if (scrub.at < span.from) return { at: span.from, playing: scrub.playing };
  return scrub;
}

/**
 * Moves the cursor one bar at a time. Do not snap to a boundary. Bars are anchored to `now`, so the grid
 * slides between one press and the next. See ARCHITECTURE.md.
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
