import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept current.
 *
 * A hook rather than a `hidden`/`block` pair for anything expensive or long: both halves of a Tailwind pair
 * are in the document, so a block of prose written that way is in the DOM twice.
 */
export function useMedia(query: string): boolean {
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

/** True where the rail is a floating column beside the globe rather than a band above or below it. Only
 * there is collapsing it a sensible thing to offer: on a phone the rail is the page. */
export function useFloatingRail(): boolean {
  return useMedia("(min-width: 1280px)");
}
