import type { PerspectiveCamera } from "three";
import { RADIUS_ATMOSPHERE } from "../geo/land";
import { DEG } from "../geo/sphere";
import { MAP_HALF_WIDTH } from "./morph";

import { ZOOM_MIN, ZOOM_MAX } from "./framing";

export const ORBIT_FLOOR = RADIUS_ATMOSPHERE + 0.12;

/* The map is the ball unrolled to 4 by 2, so it needs its own fraction. Measure against the
   height-only fit: fitting by the tighter dimension is right for a ball and, on a phone, framed the
   map's width and left a strip across the middle. */
const MAP_FIT = 0.72;

export function createOrbitDistance(camera: PerspectiveCamera, fovDeg: number) {
  let fit = 4;
  let heightFit = 4;
  const mapFit = () => heightFit * MAP_FIT;
  return {
    fit(distance: number, byHeight: number) {
      fit = distance;
      heightFit = byHeight;
    },
    at(zoom: number, morph: number): number {
      // Retain authored framing, then transfer extra magnification from the globe lens to map distance.
      const framed = Math.max(ORBIT_FLOOR, (fit + (mapFit() - fit) * morph) / Math.min(3, zoom));
      return Math.max(0.18, framed / Math.max(1, zoom / 3) ** morph);
    },
    magnification(zoom: number, morph: number): number {
      return Math.max(1, zoom / 3) ** (1 - morph);
    },
    clamp(zoom: number, morph: number): number {
      // The globe has a fixed lower bound. A zoomed-out map can show a full repeated world.
      const wholeWorld = (mapFit() * Math.tan((fovDeg / 2) * DEG) * camera.aspect) / MAP_HALF_WIDTH;
      const floor = ZOOM_MIN + (Math.min(ZOOM_MIN, wholeWorld) - ZOOM_MIN) * morph;
      return Math.max(floor, Math.min(ZOOM_MAX, zoom));
    },
  };
}
