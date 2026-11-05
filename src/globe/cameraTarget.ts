import { LAT_LIMIT } from "./framing";
import type { Controls } from "./controls";

export type FlyTo = (lon: number, lat: number, zoom?: number, liftPx?: number, entrance?: boolean) => void;

// A larger lift turns the camera farther than the panel actually covers.
const MAX_LIFT_DEG = 22;

export function createFlightTarget(controls: Controls, wake: () => void, reveal: () => void): FlyTo {
  return (lon, lat, zoom, liftPx, entrance) => {
    // Pixel lift uses the sphere's perspective, not the flat map's degrees-per-pixel approximation.
    if (liftPx)
      lat = Math.max(
        -LAT_LIMIT,
        Math.min(LAT_LIMIT, lat - Math.min(controls.degForPx(liftPx, zoom), MAX_LIFT_DEG)),
      );
    controls.flyTo(lon, lat, zoom);
    if (entrance) {
      controls.setPlanetarium(false);
      controls.setDive(false);
      controls.enter();
      reveal();
    }
    // The caller resolves its wake ref here; shared-link setup can run before the frame loop exists.
    wake();
  };
}
