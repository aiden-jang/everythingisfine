import type { Quake } from "../data/types";

/*
 * What counts as news, for the one interface that speaks.
 *
 * The live region announced anything above the threshold that it had not seen in the list before, and
 * treated "I have not seen this" as "this just happened". Those are different claims, and the second one
 * was false twice over.
 *
 * On a cold load the list goes from empty to sixty events at once and every one of them is unseen, so a
 * screen reader was told "3 new earthquakes above magnitude 4.5" about a backlog hours old. That is the
 * same mistake the wavefront layer has a named guard against: the seed creates hundreds of quakes at once
 * and none of them just happened. The canvas knew; the interface that talks did not.
 *
 * And lowering the magnitude filter admits events that were always held and never listed, which arrive in
 * the list looking exactly as unseen as a genuine arrival does.
 *
 * So news is decided by the clock rather than by what has been on screen. An earthquake reported forty
 * minutes ago is not news whatever the interface has been showing, and one reported two minutes ago is
 * news even on the first frame after a load.
 */

/**
 * How recently an event must have happened to be worth announcing.
 *
 * Agencies publish within a few minutes for anything large and up to fifteen or so for the rest, so this
 * has to be wider than the publishing delay or real events are silently dropped. Thirty minutes is
 * comfortably past it and still far short of a seed, whose events run to hours and days.
 *
 * The trade is explicit: an event published unusually late passes unannounced. That is the recoverable
 * direction. The other one floods somebody's screen reader on every page load.
 */
export const NEWS_WINDOW_MS = 30 * 60_000;

/**
 * The events worth speaking, newest first.
 *
 * `seen` is still consulted, because a re-render must not repeat itself, and is no longer the whole test.
 */
export function newsIn(
  quakes: readonly Quake[], seen: ReadonlySet<string>, above: number, now: number,
): Quake[] {
  return quakes
    .filter((q) => q.primary.magnitude >= above
      && !seen.has(q.key)
      && now - q.primary.time <= NEWS_WINDOW_MS)
    .sort((a, b) => b.primary.time - a.primary.time);
}
