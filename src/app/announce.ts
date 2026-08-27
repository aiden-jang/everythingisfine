import type { Quake } from "../data/types";

/*
 * What counts as news, for the one interface that speaks.
 *
 * Decide by the clock, never by "have I shown this before". On a cold load the list goes from empty to sixty
 * at once and every one is unseen, so a screen reader was told "3 new earthquakes" about a backlog hours old.
 * Lowering the magnitude filter did the same thing.
 */

/**
 * How recently an event must have happened to be worth announcing. Agencies publish within a few minutes for
 * anything large and up to fifteen for the rest, so this has to be wider than the publishing delay.
 *
 * The trade is explicit: an event published unusually late passes unannounced. That is the recoverable
 * direction; the other floods somebody's screen reader on every page load.
 */
export const NEWS_WINDOW_MS = 30 * 60_000;

/** The events worth speaking, newest first. `seen` is still consulted, because a re-render must not repeat
 * itself, and is no longer the whole test. */
export function newsIn(
  quakes: readonly Quake[], seen: ReadonlySet<string>, above: number, now: number,
): Quake[] {
  return quakes
    .filter((q) => q.primary.magnitude >= above
      && !seen.has(q.key)
      && now - q.primary.time <= NEWS_WINDOW_MS)
    .sort((a, b) => b.primary.time - a.primary.time);
}
