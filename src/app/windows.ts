/*
 * The windows on offer, in one place because three files decide things from them.
 *
 * They were declared in `Timeline.tsx`, which is where the buttons are, and that left the permalink
 * decoder with no way to know what a valid window was. It clamped to 24 hours, which was correct when a
 * day was the only option and silently threw away the 7d and 30d views the moment they shipped: a link
 * to a month opened on a day and looked like it had worked.
 */

/** Hours, longest last. The strip divides whichever of these is chosen into its 24 buckets. */
export const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 7 * 24, label: "7d" },
  { hours: 30 * 24, label: "30d" },
] as const;

export const WINDOW_HOURS: readonly number[] = WINDOWS.map((w) => w.hours);

/**
 * The offered window nearest a number of hours.
 *
 * Snapping rather than clamping, and the decoder's own rule is the argument: anything unreadable is
 * dropped rather than allowed to put the app in a state it has no other way to reach. A 100-hour window
 * works arithmetically and is a state no button can show, so a link carrying one would leave the window
 * group with nothing selected and no way back to what the link asked for.
 *
 * Nearest in log space, because these are multiples rather than an interval: 100 hours is 4.2 times a
 * day and 0.6 of a week, and linear distance would call the day nearer when proportionally it is not.
 */
export function nearestWindow(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return WINDOW_HOURS[0]!;
  let best = WINDOW_HOURS[0]!;
  for (const candidate of WINDOW_HOURS) {
    if (Math.abs(Math.log(candidate / hours)) < Math.abs(Math.log(best / hours))) best = candidate;
  }
  return best;
}
