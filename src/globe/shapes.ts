import { DEG } from "../geo/sphere";

/*
 * The glyphs, as polylines in lon/lat. Light gets colour and marks get shapes, so everything that is not an
 * earthquake is told apart by outline.
 *
 * Degrees, not pixels: these are things on the ground, and a cyclone really is about six degrees across.
 *
 * Stretch longitude by `1/cos(lat)` in all of them or a shape stops being that shape away from the equator.
 * Clamp near the poles, where the factor runs away.
 */

export interface Point { lon: number; lat: number }

const stretchAt = (lat: number): number => 1 / Math.max(0.25, Math.cos(lat * DEG));

const SPIRAL_TURNS = 1.6;
const SPIRAL_STEPS = 40;

/** A cyclone: the symbol cartography already uses, which cannot be read as a magnitude dot. */
export function spiral(lon: number, lat: number, radiusDeg = 3): Point[] {
  const stretch = stretchAt(lat);
  return Array.from({ length: SPIRAL_STEPS + 1 }, (_, i) => {
    const t = i / SPIRAL_STEPS;
    const angle = t * SPIRAL_TURNS * Math.PI * 2;
    const r = radiusDeg * t;
    return { lon: lon + Math.cos(angle) * r * stretch, lat: lat + Math.sin(angle) * r };
  });
}

/** A volcano: the map symbol, a triangle sitting on the point rather than centred on it. On the point,
 * because a centred triangle puts half the mark in the sea for anything coastal. */
/**
 * Where the reader is: four ticks around a gap, pointing in.
 *
 * Ticks because this app's corners are ticks or nothing, and no picture of a person would be anything but a
 * pin from another app or a joke.
 *
 * The gap is the point. A cross covers the ground it is identifying, and this mark exists to say "that spot".
 */
export function here(lon: number, lat: number, radiusDeg = 1.5): Point[][] {
  const stretch = stretchAt(lat);
  const gap = radiusDeg * 0.45;
  return [
    [{ lon, lat: lat + gap }, { lon, lat: lat + radiusDeg }],
    [{ lon, lat: lat - gap }, { lon, lat: lat - radiusDeg }],
    [{ lon: lon + gap * stretch, lat }, { lon: lon + radiusDeg * stretch, lat }],
    [{ lon: lon - gap * stretch, lat }, { lon: lon - radiusDeg * stretch, lat }],
  ];
}

export function volcano(lon: number, lat: number, radiusDeg = 1.6): Point[] {
  const stretch = stretchAt(lat);
  const w = radiusDeg * stretch;
  const h = radiusDeg * 1.5;
  return [
    { lon: lon - w, lat },
    { lon, lat: lat + h },
    { lon: lon + w, lat },
    { lon: lon - w, lat },
  ];
}

/** A wildfire: a flame, leaning, standing on the point like the volcano does. Leaning because a symmetrical
 * one reads as a leaf. Fixed size rather than scaled by burned area: size belongs to the magnitude ramp,
 * and at true scale the largest fire on Earth is a fifth of a degree across. */
export function flame(lon: number, lat: number, radiusDeg = 1.2): Point[] {
  const stretch = stretchAt(lat);
  const at = (x: number, y: number): Point =>
    ({ lon: lon + x * radiusDeg * stretch, lat: lat + y * radiusDeg });
  return [
    at(-0.55, 0), at(-0.8, 0.5), at(-0.35, 1.05), at(0.15, 1.85),
    at(0.5, 1.1), at(0.8, 0.5), at(0.55, 0), at(-0.55, 0),
  ];
}

const WAVE_ROWS = 3;
const WAVE_STEPS = 12;

/** A flood: the wavy lines cartography draws for water. Three separate strokes rather than one path, because
 * a single polyline would draw the connector from the end of one row to the start of the next. */
export function waves(lon: number, lat: number, radiusDeg = 1.4): Point[][] {
  const stretch = stretchAt(lat);
  return Array.from({ length: WAVE_ROWS }, (_, row) => {
    const y = lat + row * radiusDeg * 0.5;
    return Array.from({ length: WAVE_STEPS + 1 }, (_, i) => {
      const t = (i / WAVE_STEPS) * 2 - 1;
      return {
        lon: lon + t * radiusDeg * stretch,
        lat: y + Math.sin((i / WAVE_STEPS) * Math.PI * 4) * radiusDeg * 0.16,
      };
    });
  });
}
