import { useEffect, useState } from "react";

/** Whether a media query matches, kept current. See ARCHITECTURE.md#srcappusenarrowts. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (): void => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** True on a phone-width screen, the one break where the layout stops floating over the canvas and becomes
 * a sheet under it. */
export function useNarrow(): boolean {
  return useMedia("(max-width: 767px)");
}

/**
 * True where the whole interface floats over the canvas rather than taking rows and columns from it. See
 * ARCHITECTURE.md.
 */
export function useFloatingChrome(): boolean {
  return useMedia("(min-width: 1280px)");
}
