import { DEG } from "../geo/sphere";

/*
 * The glyphs, as polylines in longitude and latitude.
 *
 * The rule settled with the aurora is that light gets colour and marks get shapes, so every phenomenon
 * that is not an earthquake is told apart by outline rather than by hue. These are the outlines.
 *
 * Shapes in degrees rather than pixels, because they are things on the ground: a cyclone really is about
 * six degrees across and a volcano is a point being pointed at. They grow and shrink with the camera the
 * way the coastline does, which is what stops them reading as labels stuck to the screen.
 *
 * Longitude is stretched by `1/cos(lat)` in all of them, so a shape stays the shape away from the equator
 * instead of being squeezed into an ellipse. Same correction the clustering grid makes, same reason, and
 * clamped near the poles where the factor runs away.
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

/**
 * A volcano: the map symbol, a triangle sitting on the point rather than centred on it.
 *
 * On the point because that is where the mountain is, and a centred triangle puts half the mark in the sea
 * for anything coastal, which most of them are.
 */
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

/**
 * A wildfire: a flame, leaning, standing on the point like the volcano does.
 *
 * Leaning because a symmetrical one reads as a leaf. Fixed size rather than scaled by burned area: size
 * belongs to the magnitude ramp, and at true scale the largest fire on Earth is a fifth of a degree
 * across, which is nothing. The hectares go in words instead.
 */
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

/**
 * A flood: the wavy lines cartography draws for water, which no other mark here could be mistaken for.
 *
 * Three separate strokes rather than one path, because a single polyline would have to travel from the end
 * of one row to the start of the next and that connector would be drawn. Same phase on every row, since
 * alternating them reads as noise rather than as water.
 */
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
