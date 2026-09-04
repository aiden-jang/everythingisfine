/* The windows on offer, in one place because three files decide things from them. See ARCHITECTURE.md#srcappwindowsts. */

/** Hours, longest last. The strip divides whichever of these is chosen into its 24 buckets. */
export const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 7 * 24, label: "7d" },
  { hours: 30 * 24, label: "30d" },
] as const;

const WINDOW_HOURS: readonly number[] = WINDOWS.map((w) => w.hours);

/** The offered window nearest a number of hours. See ARCHITECTURE.md#srcappwindowsts. */
export function nearestWindow(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return WINDOW_HOURS[0]!;
  let best = WINDOW_HOURS[0]!;
  for (const candidate of WINDOW_HOURS) {
    if (Math.abs(Math.log(candidate / hours)) < Math.abs(Math.log(best / hours))) best = candidate;
  }
  return best;
}
