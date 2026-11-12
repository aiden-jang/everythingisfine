import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Controls } from "./controls";
import { createLandingRotation } from "./landingRotation";
import { createRotationIdle } from "./rotationIdle";
import { isLandingPresentation } from "../app/weatherLayers";
import type { GlobePresentation } from "./scenePresentation";

const MOTION = "(prefers-reduced-motion: reduce)";

export function useLandingRotation(presentation: GlobePresentation, preference: boolean) {
  const enabled = preference && isLandingPresentation(presentation);
  const settings = useRef(enabled);
  settings.current = enabled;
  const [rotation] = useState(() => {
    const advance = createLandingRotation();
    const idle = createRotationIdle();
    const media = matchMedia(MOTION);
    let camera: Controls | undefined;
    let wake = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined || !camera) return;
      const remaining = idle.remaining(performance.now());
      if (!Number.isFinite(remaining)) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (idle.remaining(performance.now()) > 0) schedule();
        else wake();
      }, remaining);
    };
    const defer = () => {
      idle.defer(performance.now());
      schedule();
      wake();
    };
    return {
      wake: () => wake(),
      step(dt: number, busy: boolean) {
        if (settings.current && busy && idle.interacted) {
          idle.defer(performance.now());
          schedule();
        }
        const active =
          settings.current && !media.matches && !document.hidden && idle.remaining(performance.now()) === 0;
        return camera ? advance(camera, dt, active, busy) : false;
      },
      attach(canvas: HTMLCanvasElement, controls: Controls, redraw: () => void) {
        camera = controls;
        wake = redraw;
        const down = (event: PointerEvent) => {
          idle.hold(event.pointerId);
          defer();
        };
        const up = (event: PointerEvent) => {
          if (idle.release(event.pointerId, performance.now())) {
            schedule();
            wake();
          }
        };
        const blur = () => {
          idle.clear(performance.now());
          schedule();
        };
        const key = (event: KeyboardEvent) => {
          const active = document.activeElement;
          if (active && active !== document.body && active.id !== "globe-view") return;
          if (
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            /^(Arrow(Left|Right|Up|Down)|[+=_\-0])$/.test(event.key)
          )
            defer();
        };
        canvas.addEventListener("pointerdown", down, { capture: true, passive: true });
        canvas.addEventListener("wheel", defer, { capture: true, passive: true });
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
        window.addEventListener("blur", blur);
        window.addEventListener("keydown", key, true);
        return () => {
          camera = undefined;
          wake = () => {};
          clearTimeout(timer);
          timer = undefined;
          canvas.removeEventListener("pointerdown", down, true);
          canvas.removeEventListener("wheel", defer, true);
          window.removeEventListener("pointerup", up, true);
          window.removeEventListener("pointercancel", up, true);
          window.removeEventListener("blur", blur);
          window.removeEventListener("keydown", key, true);
        };
      },
    };
  });
  useEffect(() => {
    const media = matchMedia(MOTION);
    media.addEventListener("change", rotation.wake);
    return () => media.removeEventListener("change", rotation.wake);
  }, [rotation]);
  useLayoutEffect(() => rotation.wake(), [enabled, rotation]);
  return rotation;
}
