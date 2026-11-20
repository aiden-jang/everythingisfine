import { useCallback, useLayoutEffect, useRef } from "react";
import { revealReadings, shiftGlobe } from "./presentationMotion";
import { globeFramingRect } from "../globe/globeFraming";

// Keep the visible pose of an interrupted flight before the next layout takes over.
function visibleRect(globe: HTMLElement, target: DOMRect, origin: readonly [number, number]): DOMRect {
  const matrix = new DOMMatrix(getComputedStyle(globe).transform);
  const [x, y] = origin;
  return new DOMRect(
    target.x + x * (1 - matrix.a) + matrix.e,
    target.y + y * (1 - matrix.d) + matrix.f,
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
  const origin = useRef<readonly [number, number]>([0, 0]);
  const lastMode = useRef<string | null>(null);
  const synchronize = useCallback(() => {
    const globe = document.querySelector<HTMLElement>(".zone-canvas");
    if (!globe) return;
    const frame = globe.closest<HTMLElement>(".frame");
    const zones = globe.parentElement;
    const mode = `${frame?.dataset.presentation}:${frame?.hasAttribute("data-landing")}:${zones?.dataset.tongaPhase}`;
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    stopFold(globe);
    const from = previous.current
      ? motions.current.some((motion) => motion.id === "globe-presentation" && motion.playState === "running")
        ? visibleRect(globe, previous.current, origin.current)
        : previous.current
      : null;
    for (const motion of motions.current) motion.cancel();
    motions.current = [];
    previous.current = globeFramingRect(globe);
    if (!from || !globe.animate || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const bounds = globe.getBoundingClientRect();
    const [x = 0, y = 0] = getComputedStyle(globe).transformOrigin.split(" ").map(parseFloat);
    origin.current = [x + bounds.x - previous.current.x, y];
    const flight = shiftGlobe(globe, from);
    const panel = document.querySelector<HTMLElement>(
      globe.closest("[data-presentation=explore]") ? "#chrome-rail" : ".observatory-intro",
    );
    const reading = revealReadings(panel, "drift", 520);
    const controls = revealReadings(globe.querySelector(".canvas-information"), "fade", 520);
    if (flight) motions.current.push(flight);
    if (reading) motions.current.push(reading);
    if (controls) motions.current.push(controls);
  }, []);
  useLayoutEffect(synchronize, [layout, synchronize]);

  useLayoutEffect(() => {
    const globe = document.querySelector<HTMLElement>(".zone-canvas");
    if (!globe) return;
    const resize = new ResizeObserver(() => {
      if (!motions.current.some((motion) => motion.playState === "running"))
        previous.current = globeFramingRect(globe);
    });
    resize.observe(globe);
    const chapters = new MutationObserver(synchronize);
    if (globe.parentElement) chapters.observe(globe.parentElement, { attributeFilter: ["data-tonga-phase"] });
    const stop = () => {
      stopFold(globe);
      for (const motion of motions.current) motion.cancel();
      motions.current = [];
      previous.current = globeFramingRect(globe);
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
      chapters.disconnect();
      stop();
      document.removeEventListener("pointerdown", steer, true);
      document.removeEventListener("wheel", steer, true);
      document.removeEventListener("keydown", steer, true);
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", reduce);
    };
  }, [synchronize]);
}
