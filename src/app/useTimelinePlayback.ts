import { useEffect, type Dispatch, type SetStateAction } from "react";
import { step, type Scrub } from "./scrub";

export function useTimelinePlayback(
  playing: boolean,
  windowMs: number,
  setScrub: Dispatch<SetStateAction<Scrub>>,
): void {
  // Twenty ticks a second bounds the cost of re-rendering the rail and re-syncing the event layer.
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    const id = window.setInterval(() => {
      const tick = performance.now();
      const dt = (tick - previous) / 1000;
      previous = tick;
      const at = Date.now();
      setScrub((scrub) => step(scrub, { from: at - windowMs, to: at }, dt));
    }, 50);
    return () => window.clearInterval(id);
  }, [playing, windowMs, setScrub]);
}
