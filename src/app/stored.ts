/* Saved preferences, behind one prefix instead of ten string literals. Read falls back to the old prefix
   once and writes the new one, which migrates a preference the first time its owner opens the page. See
   ARCHITECTURE.md. */

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
