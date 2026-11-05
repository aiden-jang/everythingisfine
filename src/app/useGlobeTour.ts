import { useCallback, useEffect, useRef, useState } from "react";
import { TOUR_DWELL_MS, tourArrivedAt, type Stop } from "./tour";

type FlyTo = (lon: number, lat: number, zoom?: number, liftPx?: number) => void;

export function useGlobeTour(
  stops: Stop[],
  flyTo: { readonly current: FlyTo },
  onStop?: (stop: Stop | null) => void,
) {
  const [tourAt, setTourAt] = useState<number | null>(null);
  const [tourArrived, setTourArrived] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const target = useRef<{ lon: number; lat: number; zoom: number; index: number } | null>(null);
  const tourButton = useRef<HTMLButtonElement>(null);
  const tourControls = useRef<HTMLElement>(null);
  const route = useRef<Stop[]>([]);
  const camera = useRef<{ lon: number; lat: number; zoom: number } | null>(null);
  const remaining = useRef({ ms: TOUR_DWELL_MS });
  const stopTour = useCallback(() => {
    setTourAt(null);
    target.current = null;
    if (camera.current) flyTo.current(camera.current.lon, camera.current.lat, camera.current.zoom);
  }, [flyTo]);
  const startTour = useCallback(() => {
    if (stops.length === 0) return;
    route.current = stops;
    setPaused(false);
    setTourAt(0);
  }, [stops]);
  const nextTour = useCallback(() => {
    setTourAt((at) => (at === null || at + 1 >= route.current.length ? null : at + 1));
  }, []);
  const previousTour = useCallback(() => {
    setTourAt((at) => (at === null ? null : Math.max(0, at - 1)));
  }, []);
  const togglePause = useCallback(() => {
    setPaused((value) => !value);
  }, []);

  useEffect(() => {
    remaining.current = { ms: TOUR_DWELL_MS };
    setTourArrived(null);
    const stop = tourAt === null ? null : route.current[tourAt];
    if (!stop) {
      target.current = null;
      return;
    }
    target.current = { lon: stop.lon, lat: stop.lat, zoom: stop.zoom, index: tourAt! };
    flyTo.current(stop.lon, stop.lat, stop.zoom);
  }, [tourAt, flyTo]);

  const touring = tourAt !== null && tourArrived === tourAt ? (route.current[tourAt] ?? null) : null;
  useEffect(() => {
    onStop?.(touring);
  }, [onStop, touring]);

  // Reading time begins at arrival and pauses with the tab, not while the camera is still travelling.
  useEffect(() => {
    if (touring === null || paused) return;
    const dwell = remaining.current;
    let timer = 0,
      started = 0;
    const suspend = (): void => {
      if (!timer) return;
      window.clearTimeout(timer);
      dwell.ms = Math.max(0, dwell.ms - (performance.now() - started));
      timer = 0;
    };
    const resume = (): void => {
      if (document.hidden || timer) return;
      started = performance.now();
      timer = window.setTimeout(nextTour, dwell.ms);
    };
    const visibility = (): void => {
      if (document.hidden) suspend();
      else resume();
    };
    resume();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      suspend();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [touring, paused, nextTour]);

  useEffect(() => {
    if (tourAt === null) return;
    const end = (event: Event): void => {
      if (
        event instanceof KeyboardEvent &&
        ["Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "0"].includes(event.key)
      ) {
        stopTour();
        return;
      }
      if (
        tourButton.current?.contains(event.target as Node) ||
        tourControls.current?.contains(event.target as Node)
      )
        return;
      stopTour();
    };
    window.addEventListener("pointerdown", end, { capture: true });
    window.addEventListener("wheel", end, { capture: true, passive: true });
    window.addEventListener("keydown", end, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", end, { capture: true });
      window.removeEventListener("wheel", end, { capture: true });
      window.removeEventListener("keydown", end, { capture: true });
    };
  }, [tourAt, stopTour]);

  const onCamera = useCallback((state: { lon: number; lat: number; zoom: number }) => {
    camera.current = state;
    const next = target.current;
    if (!next) return;
    if (tourArrivedAt(state, next)) {
      target.current = null;
      setTourArrived(next.index);
    }
  }, []);
  return {
    tourAt,
    touring,
    tourButton,
    tourControls,
    paused,
    startTour,
    stopTour,
    nextTour,
    previousTour,
    togglePause,
    tourLength: route.current.length,
    onCamera,
  };
}
