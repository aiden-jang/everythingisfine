import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept current.
 *
 * A hook rather than a `hidden`/`block` pair for anything expensive or long: both halves of a Tailwind pair
 * are in the document, so a block of prose written that way is in the DOM twice.
 */
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
 * True where the whole interface floats over the canvas rather than taking rows and columns from it.
 *
 * The two folds are opposites about this. The rail is 356px of a 1440px screen and covers the globe, so
 * folding it is worth offering here and nowhere else - narrower, it is a strip or, on a phone, the page.
 * The bar is the reverse: floating it is transparent and 46px of the rail's height, and the canvas is the
 * full 900px either way, so there is nothing to gain. Narrower it is an opaque row taking 68px of a 768px
 * screen and 80px of a phone, which is worth a fold.
 */
export function useFloatingChrome(): boolean {
  return useMedia("(min-width: 1280px)");
}
