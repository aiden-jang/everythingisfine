/*
 * Where the world's slabs are, from five years of the catalogue.
 *
 * Earthquakes are drawn at their own depth, and on live data that is almost nothing to look at. Measured
 * against a real USGS day: 237 events, 14 between 70 and 300km, and **exactly two** below 300. A subducted
 * plate is a sheet a hundred kilometres thick reaching seven hundred down, and two points do not describe
 * a sheet. The geometry was right and the sample was hopeless.
 *
 * This is the sample. Every magnitude 4.5 event deeper than 300km between 2020 and 2025, which is 1,583
 * of them, and 1,048 of those in the Tonga-Fiji corner alone. Drawn together they are the dipping plane
 * the day view can only hint at.
 *
 * **It is geography, not data, and it is drawn that way.** These are not today's earthquakes and must not
 * be mistaken for them, so they carry no ramp colour and no magnitude size: one dim tone, one small dot,
 * the same treatment the plate boundaries get. The boundaries say where two plates meet at the surface;
 * this says where one of them went. Today's events then draw over it in the ramp, which is the only layer
 * on this globe entitled to hue.
 *
 * **Not fetched at runtime.** `tools/make-slab.mjs` asks USGS once and commits the answer, because this
 * does not change: it is where slabs are, not what happened this morning. 37kB of numbers, 12kB over the
 * wire, as its own chunk behind a toggle - the arrangement `plateMotion.json` already has, for the reason
 * given there.
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
