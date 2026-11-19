import { useLayoutEffect, useRef } from "react";
import { revealReadings, shiftGlobe } from "./presentationMotion";

// Keep the visible pose of an interrupted flight before the next layout takes over.
function visibleRect(globe: HTMLElement, target: DOMRect): DOMRect {
  const matrix = new DOMMatrix(getComputedStyle(globe).transform);
  return new DOMRect(
    target.x + (target.width * (1 - matrix.a)) / 2 + matrix.e,
    target.y + (target.height * (1 - matrix.d)) / 2 + matrix.f,
    target.width * matrix.a,
    target.height * matrix.d,
  );
}

function stopFold(globe: HTMLElement) {
  globe
    .querySelector(".globe-scene")
    ?.getAnimations()
    .find((motion) => motion.id === "globe-fold")
    ?.cancel();
}

export function useWorldLayout(layout: string) {
  const previous = useRef<DOMRect | null>(null);
  const motions = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const globe = document.querySelector<HTMLElement>(".zone-canvas");
    if (!globe) return;
    stopFold(globe);
    const from = previous.current
      ? motions.current.some((motion) => motion.id === "globe-presentation" && motion.playState === "running")
        ? visibleRect(globe, previous.current)
        : previous.current
      : null;
    for (const motion of motions.current) motion.cancel();
    motions.current = [];
    previous.current = globe.getBoundingClientRect();
    if (!from || !globe.animate || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const flight = shiftGlobe(globe, from);
    if (!flight) return;
    const panel = document.querySelector<HTMLElement>(
      globe.closest("[data-presentation=explore]") ? "#chrome-rail" : ".observatory-intro",
    );
    const reading = revealReadings(panel);
    if (flight) motions.current.push(flight);
    if (reading) motions.current.push(reading);
  }, [layout]);

  useLayoutEffect(() => {
    const globe = document.querySelector<HTMLElement>(".zone-canvas");
    if (!globe) return;
    const resize = new ResizeObserver(() => {
      if (!motions.current.some((motion) => motion.playState === "running"))
        previous.current = globe.getBoundingClientRect();
    });
    resize.observe(globe);
    const stop = () => {
      stopFold(globe);
      for (const motion of motions.current) motion.cancel();
      motions.current = [];
      previous.current = globe.getBoundingClientRect();
    };
    const steer = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("#globe-view")) stop();
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = () => {
      if (preference.matches) stop();
    };
    document.addEventListener("pointerdown", steer, true);
    document.addEventListener("wheel", steer, { capture: true, passive: true });
    document.addEventListener("keydown", steer, true);
    document.addEventListener("visibilitychange", visibility);
    preference.addEventListener("change", reduce);
    return () => {
      resize.disconnect();
      stop();
      document.removeEventListener("pointerdown", steer, true);
      document.removeEventListener("wheel", steer, true);
      document.removeEventListener("keydown", steer, true);
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", reduce);
    };
  }, []);
}
