/*
 * The real sky, turned to the right place for the moment on screen.
 *
 * The procedural field this replaces looked convincing, and that was its whole limit: Orion was not there
 * to be found. `tools/make-stars.mjs` commits the Yale Bright Star Catalogue down to magnitude 6.0, about
 * what an unaided eye reaches: 5,080 stars, 88kB, 34kB over the wire.
 *
 * Its own chunk. A plain import puts it in `land`, which is modulepreloaded, taking that chunk from 41kB
 * to 76kB over the wire on the critical path for a background. The layer draws empty until the table lands.
 */
import { DEG } from "./sphere";

/** `[rightAscensionDeg, declinationDeg, visualMagnitude, ...]`, three numbers per star. */
export type StarTable = readonly number[];

/** The faintest star in the committed table, and the value the brightness ramp is built against. */
export const STAR_MAG_LIMIT = 6.0;
/** Sirius, which is the brightest star there is and so the other end of that ramp. */
const STAR_MAG_BRIGHTEST = -1.46;

/** Midday on 2000-01-01 UTC, near enough to the J2000.0 epoch for anything drawn on a screen. */
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/**
 * Greenwich mean sidereal time in degrees: how far the sky has turned over the prime meridian. A star with
 * right ascension `ra` stands over longitude `ra - gmstDeg(at)`, so one rotation places the whole table.
 *
 * The linear term is enough. The full series carries a `T^2` correction reaching 0.000026 degrees by 2026,
 * four orders of magnitude below this table's own rounding.
 *
 * UT1 is approximated by UTC, which is what a browser clock gives: 0.9 seconds apart at worst, and 0.9
 * seconds of Earth rotation is 0.004 degrees.
 */
export function gmstDeg(at: number): number {
  const days = (at - J2000_MS) / 86_400_000;
  const deg = 280.460_618_37 + 360.985_647_366_29 * days;
  return ((deg % 360) + 360) % 360;
}

/**
 * How bright to draw a star, as 0 for the faintest in the table and 1 for Sirius. Deliberately not the
 * physical flux: the real ratio across this table is about 1,400 to 1, so a literal mapping draws Sirius
 * and leaves the constellation it belongs to as empty space.
 */
export function starBrightness(magnitude: number): number {
  const span = STAR_MAG_LIMIT - STAR_MAG_BRIGHTEST;
  return Math.max(0, Math.min(1, (STAR_MAG_LIMIT - magnitude) / span));
}

/*
 * The constellation figures: each entry one polyline, as a flat run of right ascension and declination.
 * From d3-celestial, copyright (c) 2015 Olaf Frohn, BSD 3-Clause. See `tools/make-figures.mjs`.
 */
export type FigureTable = readonly (readonly number[])[];

/** Its own chunk, and only fetched when the reader asks for the lines. */
export async function loadFigures(): Promise<FigureTable> {
  const module = await import("./figures.json");
  return module.default as FigureTable;
}

/** Its own chunk on first use, so the sky is not on the critical path. */
export async function loadStars(): Promise<StarTable> {
  const module = await import("./stars.json");
  return module.default as StarTable;
}

/** Unit vector for a star at `gmst = 0`. The layer's own rotation carries the sidereal turn. */
export function starVector(raDeg: number, decDeg: number): [number, number, number] {
  const phi = decDeg * DEG;
  const lam = raDeg * DEG;
  const c = Math.cos(phi);
  return [c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam)];
}
