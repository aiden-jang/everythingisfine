/*
 * Saved preferences, behind one prefix instead of ten string literals.
 *
 * The prefix was `firstmotion.`, written out at each of the ten places a preference is read or written.
 * Renaming the app therefore had a consequence nobody would have chosen: every returning viewer's rail
 * width, ramp, projection and announce threshold silently back to defaults, because the new keys are
 * simply absent.
 *
 * So the read falls back to the old prefix once and writes the new one, which migrates a preference the
 * first time its owner opens the page and never looks again after that. Cheap, and the alternative is
 * throwing away the one bit of state this app asks people to set.
 */

const PREFIX = "eif.";
/** The name this app shipped under before it grew past earthquakes. */
const WAS = "firstmotion.";

/** A stored string, preferring the current key and inheriting the old one once. */
export function stored(key: string): string | null {
  try {
    const now = localStorage.getItem(PREFIX + key);
    if (now !== null) return now;
    const before = localStorage.getItem(WAS + key);
    if (before !== null) localStorage.setItem(PREFIX + key, before);
    return before;
  } catch {
    // Private browsing refuses storage entirely. A missing preference is a default, not a failure.
    return null;
  }
}

export function store(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Same: a preference that cannot be saved is not worth taking the page down for.
  }
}
