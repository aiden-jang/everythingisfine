import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { DEG } from "../geo/sphere";
import { morphable } from "./morph";
import type { Point } from "./shapes";

/*
 * Every mark that is not an earthquake, in one layer.
 *
 * Generalised out of the cyclone layer when volcanoes became the third phenomenon and wildfires and floods
 * were queued behind them. Four near-identical `LineSegments` layers is four places to fix the same seam
 * bug, and this app has already paid for that lesson once in the land mesh.
 *
 * It knows nothing about storms or volcanoes. It draws polylines in longitude and latitude, achromatic,
 * above the boundaries they sit on and below the markers that carry meaning. What shape a phenomenon gets
 * is decided in `shapes.ts`, and which shapes exist is decided in `app/marks.ts`.
 */

/** Above the plate boundaries these things sit on, below the land that contains them. */
const RADIUS = 1.004;
/**
 * Segments held.
 *
 * Sized against the worst day the feeds can produce rather than against today: GDACS caps each list at
 * 100, so the ceiling is 100 flames at ~10 segments, 100 floods at three strokes of twelve, 23 volcano
 * triangles and a season's worth of storm track, which lands near 5,100. Doubled from there, because the
 * failure mode of guessing low is marks silently missing from the far end of the list.
 */
const CAPACITY = 12000;
/** Longest leg before it is split, so a chord does not cut inside the globe. */
const DENSIFY_DEG = 1.5;
/** Beyond this a leg is a wrap across the antimeridian, not a mark crossing it. */
const WRAP_DEG = 170;

export type Polyline = readonly Point[];

export interface MarkLayer {
  object: LineSegments;
  set: (shapes: readonly Polyline[]) => void;
  dispose: () => void;
}

export function createMarkLayer(morph: { value: number }): MarkLayer {
  const positions = new Float32Array(CAPACITY * 6);
  const lonLats = new Float32Array(CAPACITY * 4);
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const llAttr = new BufferAttribute(lonLats, 2);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aLonLat", llAttr);
  geometry.setDrawRange(0, 0);

  const material = new LineBasicMaterial({ color: 0x9fb0cc, transparent: true, opacity: 0.72 });
  morphable(material, morph);
  const object = new LineSegments(geometry, material);
  object.renderOrder = 3.5;

  let written = 0;
  const put = (aLon: number, aLat: number, bLon: number, bLat: number): void => {
    if (written >= CAPACITY) return;
    const i = written * 6;
    const j = written * 4;
    const pa = aLat * DEG;
    const la = aLon * DEG;
    const ca = Math.cos(pa) * RADIUS;
    positions[i] = ca * Math.sin(la);
    positions[i + 1] = Math.sin(pa) * RADIUS;
    positions[i + 2] = ca * Math.cos(la);
    const pb = bLat * DEG;
    const lb = bLon * DEG;
    const cb = Math.cos(pb) * RADIUS;
    positions[i + 3] = cb * Math.sin(lb);
    positions[i + 4] = Math.sin(pb) * RADIUS;
    positions[i + 5] = cb * Math.cos(lb);
    lonLats[j] = aLon;
    lonLats[j + 1] = aLat;
    lonLats[j + 2] = bLon;
    lonLats[j + 3] = bLat;
    written += 1;
  };

  return {
    object,
    set: (shapes) => {
      written = 0;
      for (const shape of shapes) {
        for (let i = 1; i < shape.length; i += 1) {
          const a = shape[i - 1]!;
          const b = shape[i]!;
          // Dropped rather than drawn, for the reason `buildPlates` drops the same thing: joining 179 to
          // -179 is a hairline straight across the map and a chord through the planet.
          if (Math.abs(b.lon - a.lon) > WRAP_DEG) continue;
          const span = Math.max(Math.abs(b.lon - a.lon), Math.abs(b.lat - a.lat));
          const steps = Math.max(1, Math.ceil(span / DENSIFY_DEG));
          for (let step = 0; step < steps; step += 1) {
            const t0 = step / steps;
            const t1 = (step + 1) / steps;
            put(
              a.lon + (b.lon - a.lon) * t0, a.lat + (b.lat - a.lat) * t0,
              a.lon + (b.lon - a.lon) * t1, a.lat + (b.lat - a.lat) * t1,
            );
          }
        }
      }
      geometry.setDrawRange(0, written * 2);
      posAttr.needsUpdate = true;
      llAttr.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
