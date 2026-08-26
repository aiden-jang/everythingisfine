/*
 * The real sky, turned to the right place for the moment on screen.
 *
 * The field this replaces was procedural and looked convincing, and that was its whole limit: a reader
 * who knows the sky could not find anything in it. Orion was not there to be found. A sky that can be
 * recognised does something a texture cannot, which is tell you which way you are facing.
 *
 * `tools/make-stars.mjs` commits the Yale Bright Star Catalogue down to magnitude 6.0, which is about
 * what an unaided eye reaches, as a flat `[ra, dec, mag, ...]` table in degrees. 5,080 stars, 88kB, 34kB
 * over the wire.
 *
 * **Its own chunk, like every other table this size here.** A plain import put it in `land`, which
 * `manualChunks` builds out of everything under `/src/geo/` and which is modulepreloaded: the chunk went
 * from 41kB over the wire to 76kB, an 84% rise on the critical path for a background. The sky is on from
 * the first frame, but it is the thing furthest behind an entrance animation, so arriving a moment late
 * costs nothing a reader can see. The layer draws empty until the table lands.
 */
import { DEG } from "./sphere";

/** `[rightAscensionDeg, declinationDeg, visualMagnitude, ...]`, three numbers per star. */
export type StarTable = readonly number[];

/** The faintest star in the committed table, and the value the brightness ramp is built against. */
export const STAR_MAG_LIMIT = 6.0;
/** Sirius, which is the brightest star there is and so the other end of that ramp. */
export const STAR_MAG_BRIGHTEST = -1.46;

/** Midday on 2000-01-01 UTC, near enough to the J2000.0 epoch for anything drawn on a screen. */
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/**
 * Greenwich mean sidereal time in degrees: how far the sky has turned over the prime meridian.
 *
 * This is the whole of what makes the field correct rather than decorative. A star with right ascension
 * `ra` stands over longitude `ra - gmstDeg(at)`, so the entire table is placed by one rotation about the
 * pole.
 *
 * The caller decides which moment to hand in, and today the scene hands in wall-clock time because that
 * is what it already does for the sun. So the sky is right for the live view and is tonight's sky over an
 * archived day, exactly as the terminator is tonight's terminator over one.
 *
 * The linear term is enough. The full series carries a `T^2` correction that reaches 0.000026 degrees by
 * 2026, which is four orders of magnitude below this table's own rounding.
 *
 * **UT1 is approximated by UTC**, which is what a browser clock gives. They are kept within 0.9 seconds
 * of each other by leap seconds, and 0.9 seconds of Earth rotation is 0.004 degrees.
 */
export function gmstDeg(at: number): number {
  const days = (at - J2000_MS) / 86_400_000;
  const deg = 280.460_618_37 + 360.985_647_366_29 * days;
  return ((deg % 360) + 360) % 360;
}

/**
 * How bright to draw a star, as 0 for the faintest in the table and 1 for Sirius.
 *
 * Deliberately not the physical flux. Magnitude is logarithmic and the real ratio across this table is
 * about 1,400 to 1, so a literal mapping draws Sirius and leaves the constellations it belongs to as empty
 * space. The renderer spends this on size and opacity together, each on its own curve.
 */
export function starBrightness(magnitude: number): number {
  const span = STAR_MAG_LIMIT - STAR_MAG_BRIGHTEST;
  return Math.max(0, Math.min(1, (STAR_MAG_LIMIT - magnitude) / span));
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
