import { useEffect, type Dispatch, type SetStateAction } from "react";
import { step, type Scrub } from "./scrub";

export function useTimelinePlayback(
  playing: boolean,
  windowMs: number,
  setScrub: Dispatch<SetStateAction<Scrub>>,
  archive: { from: number; to: number } | null,
): void {
  // Twenty ticks a second bounds the cost of re-rendering the rail and re-syncing the event layer.
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let timer = 0;
    function visibility() {
      window.clearInterval(timer);
      if (document.hidden) return;
      previous = performance.now();
      timer = window.setInterval(() => {
        const tick = performance.now();
        const dt = (tick - previous) / 1000;
        previous = tick;
        const at = Date.now();
        setScrub((scrub) => step(scrub, archive ?? { from: at - windowMs, to: at }, dt));
      }, 50);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [playing, windowMs, setScrub, archive]);
}
