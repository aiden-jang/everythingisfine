import { useCallback, useEffect, useRef, useState } from "react";
import { TOUR_DWELL_MS, type Stop } from "./tour";

type FlyTo = (lon: number, lat: number, zoom?: number, liftPx?: number) => void;

export function useGlobeTour(stops: Stop[], flyTo: { readonly current: FlyTo }) {
  const [tourAt, setTourAt] = useState<number | null>(null);
  // Narrate only after the camera reaches the captured stop.
  const tourTarget = useRef<{ lon: number; lat: number; index: number } | null>(null);
  const [tourArrived, setTourArrived] = useState<number | null>(null);
  /* Keep the tour's own button out of the end-on-interaction listener below, or pressing Stop is a
  race between `pointerdown` ending the tour and the click starting it again. */
  const tourButton = useRef<HTMLButtonElement>(null);
  const route = useRef<Stop[]>([]);
  const stopTour = useCallback(() => {
    setTourAt(null);
  }, []);
  const startTour = useCallback(() => {
    if (stops.length === 0) return;
    route.current = stops;
    setTourAt(0);
  }, [stops]);
  // Capture phase, so a click on a rail button ends the tour as well as doing its own job.
  useEffect(() => {
    if (tourAt === null) return undefined;
    const stop = route.current[tourAt];
    if (!stop) {
      setTourAt(null);
      return undefined;
    }
    tourTarget.current = { lon: stop.lon, lat: stop.lat, index: tourAt };
    setTourArrived(null);
    flyTo.current(stop.lon, stop.lat, stop.zoom);
    const next = window.setTimeout(() => {
      setTourAt((at) => (at === null || at + 1 >= route.current.length ? null : at + 1));
    }, TOUR_DWELL_MS);
    const end = (event: Event): void => {
      if (tourButton.current?.contains(event.target as Node)) return;
      setTourAt(null);
    };
    window.addEventListener("pointerdown", end, { capture: true });
    window.addEventListener("wheel", end, { capture: true, passive: true });
    window.addEventListener("keydown", end, { capture: true });
    return () => {
      window.clearTimeout(next);
      window.removeEventListener("pointerdown", end, { capture: true });
      window.removeEventListener("wheel", end, { capture: true });
      window.removeEventListener("keydown", end, { capture: true });
    };
  }, [tourAt, flyTo]);
  const touring = tourAt !== null && tourArrived === tourAt ? (route.current[tourAt] ?? null) : null;

  const onCamera = useCallback((state: { lon: number; lat: number }) => {
    // Spring flights approach asymptotically; a four-degree arrival tolerance keeps narration reachable.
    const target = tourTarget.current;
    if (!target) return;
    let dLon = Math.abs(state.lon - target.lon) % 360;
    if (dLon > 180) dLon = 360 - dLon;
    if (dLon < 4 && Math.abs(state.lat - target.lat) < 4) {
      tourTarget.current = null;
      setTourArrived(target.index);
    }
  }, []);
  return { tourAt, touring, tourButton, startTour, stopTour, tourLength: route.current.length, onCamera };
}
