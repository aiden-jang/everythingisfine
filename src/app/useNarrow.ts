import { useEffect, useState } from "react";

/**
 * True on a phone-width screen, the one break where the layout stops floating over the canvas and becomes
 * a sheet under it.
 *
 * A hook rather than a `hidden`/`block` pair for anything expensive or long: both halves of a Tailwind pair
 * are in the document, so a block of prose written that way is in the DOM twice.
 */
export function useNarrow(): boolean {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
