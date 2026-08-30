import type { Quake } from "../data/types";

/* What counts as news, for the one interface that speaks. See ARCHITECTURE.md. */

/** How recently an event must have happened to be worth announcing. See ARCHITECTURE.md. */
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
