/*
 * Where the world's slabs are, from five years of the catalogue.
 *
 * A real USGS day carries 237 events, 14 between 70 and 300km, and exactly two below 300. A subducted plate is
 * a sheet reaching seven hundred kilometres down, and two points do not describe a sheet.
 *
 * This is the sample: every magnitude 4.5 event deeper than 300km between 2020 and 2025, 1,583 of them, with
 * 1,048 in the Tonga-Fiji corner alone.
 *
 * It is geography, not data, and it is drawn that way: no ramp colour and no magnitude size, the same
 * treatment the plate boundaries get. The boundaries say where two plates meet at the surface; this says
 * where one of them went.
 *
 * Not fetched at runtime. `tools/make-slab.mjs` asks USGS once and commits the answer, because this does not
 * change: 37kB of numbers, 12kB over the wire, as its own chunk behind a toggle.
 */

/** `[lon, lat, depthKm, magnitude]`, as generated. */
export type SlabPoint = [number, number, number, number];

/** The span the committed table covers, for the sentence in the key. */
export const SLAB_FROM = "2020";
export const SLAB_TO = "2025";
/** Both thresholds are stated in the key, because each one shapes what the layer looks like. */
export const SLAB_MIN_DEPTH_KM = 300;
export const SLAB_MIN_MAGNITUDE = 4.5;

/** Its own chunk on first use, so a toggle nobody presses costs nothing. */
export async function loadSlab(): Promise<readonly SlabPoint[]> {
  const module = await import("./slab.json");
  return module.default as SlabPoint[];
}
