import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";
import { DEG } from "../geo/sphere";
import { morphable } from "./morph";
import type { Cyclone } from "../sources/cyclones";

/*
 * Cyclones: where each one has been, and a spiral where it is.
 *
 * A track rather than a dot, because the track is the explanation. Every storm forms in the band either
 * side of the equator, never on it, and bends away from it; the measured track of one Pacific typhoon runs
 * 7.9 to 26.5 degrees north while moving west. Drawn as a point that is a fact you have to be told, and
 * drawn as a line it is a fact you can see.
 *
 * **Achromatic, and a spiral.** The rule settled with the aurora is that light gets colour and marks get
 * shapes. This is a mark, so it gets the shape cartography already uses for a cyclone, which also means it
 * cannot be mistaken for a magnitude dot at any size.
 *
 * Sized in degrees rather than pixels, so the spiral is roughly the storm's own extent, about six degrees
 * across. It grows and shrinks with the camera like the coastline does, because it is a thing on the
 * ground and not a label.
 */

/** Just above the plate boundaries and below the markers, like the rest of the explanatory geography. */
const RADIUS = 1.004;
/** Half-width of the spiral in degrees. A large cyclone is around 500km of storm, which is about this. */
const SPIRAL_DEG = 3;
const SPIRAL_TURNS = 1.6;
const SPIRAL_STEPS = 40;
/** Segments held. Sixteen storms of a hundred and fifty segments is far past any real season. */
const CAPACITY = 2400;
/** Longest track segment before it is split, so a chord does not cut inside the globe. */
const DENSIFY_DEG = 1.5;

/**
 * The cyclone glyph, as a polyline in longitude and latitude.
 *
 * Longitude is stretched by `1/cos(lat)` so the spiral stays round rather than being squeezed into an
 * ellipse away from the equator, which is the same correction the clustering grid makes and for the same
 * reason. Clamped near the poles, where the factor runs away and no cyclone has ever been.
 */
export function spiral(
  lon: number, lat: number, radiusDeg = SPIRAL_DEG,
): { lon: number; lat: number }[] {
  const stretch = 1 / Math.max(0.25, Math.cos(lat * DEG));
  return Array.from({ length: SPIRAL_STEPS + 1 }, (_, i) => {
    const t = i / SPIRAL_STEPS;
    const angle = t * SPIRAL_TURNS * Math.PI * 2;
    const r = radiusDeg * t;
    return {
      lon: lon + Math.cos(angle) * r * stretch,
      lat: lat + Math.sin(angle) * r,
    };
  });
}

export interface CycloneLayer {
  object: LineSegments;
  set: (storms: readonly Cyclone[]) => void;
  dispose: () => void;
}

export function createCycloneLayer(morph: { value: number }): CycloneLayer {
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
  // Above the boundaries it sits over and below the markers, which are the data.
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

  /** A track leg, split so a long one does not cut a chord through the planet. */
  const leg = (a: { lon: number; lat: number }, b: { lon: number; lat: number }): void => {
    const span = Math.max(Math.abs(b.lon - a.lon), Math.abs(b.lat - a.lat));
    const steps = Math.max(1, Math.ceil(span / DENSIFY_DEG));
    for (let s = 0; s < steps; s += 1) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      put(
        a.lon + (b.lon - a.lon) * t0, a.lat + (b.lat - a.lat) * t0,
        a.lon + (b.lon - a.lon) * t1, a.lat + (b.lat - a.lat) * t1,
      );
    }
  };

  return {
    object,
    set: (storms) => {
      written = 0;
      for (const storm of storms) {
        for (let i = 1; i < storm.track.length; i += 1) leg(storm.track[i - 1]!, storm.track[i]!);
        const glyph = spiral(storm.lon, storm.lat);
        for (let i = 1; i < glyph.length; i += 1) leg(glyph[i - 1]!, glyph[i]!);
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
