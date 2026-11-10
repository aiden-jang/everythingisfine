import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Controls } from "./controls";
import { createLandingRotation } from "./landingRotation";

const MOTION = "(prefers-reduced-motion: reduce)";

export function useLandingRotation(enabled: boolean) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia(MOTION).matches);
  const settings = useRef({ enabled, paused, reduced });
  settings.current = { enabled, paused, reduced };
  const [rotation] = useState(() => {
    const advance = createLandingRotation();
    let camera: Controls | undefined;
    let wake = () => {};
    const pause = () => {
      if (!settings.current.enabled) return;
      settings.current.paused = true;
      setPaused(true);
      wake();
    };
    return {
      wake: () => wake(),
      step(dt: number, busy: boolean) {
        const { enabled, paused, reduced } = settings.current;
        return camera ? advance(camera, dt, enabled && !paused && !reduced && !document.hidden, busy) : false;
      },
      attach(canvas: HTMLCanvasElement, controls: Controls, redraw: () => void) {
        camera = controls;
        wake = redraw;
        const key = (event: KeyboardEvent) => {
          const active = document.activeElement;
          if (active && active !== document.body && active.id !== "globe-view") return;
          if (
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            /^(Arrow(Left|Right|Up|Down)|[+=_\-0])$/.test(event.key)
          )
            pause();
        };
        canvas.addEventListener("pointerdown", pause, { capture: true, passive: true });
        canvas.addEventListener("wheel", pause, { capture: true, passive: true });
        window.addEventListener("keydown", key, true);
        return () => {
          camera = undefined;
          wake = () => {};
          canvas.removeEventListener("pointerdown", pause, true);
          canvas.removeEventListener("wheel", pause, true);
          window.removeEventListener("keydown", key, true);
        };
      },
    };
  });
  useEffect(() => {
    const media = matchMedia(MOTION);
    const change = () => {
      settings.current.reduced = media.matches;
      setReduced(media.matches);
      rotation.wake();
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [rotation]);
  useLayoutEffect(() => rotation.wake(), [enabled, paused, reduced, rotation]);
  const control =
    enabled && !reduced ? (
      <button
        type="button"
        className="landing-rotation"
        aria-label={paused ? "Resume globe rotation" : "Pause globe rotation"}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? "Resume rotation" : "Pause rotation"}
      </button>
    ) : null;
  return { rotation, control };
}
