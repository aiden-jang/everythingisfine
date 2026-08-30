/* Where the world's slabs are, from five years of the catalogue. See ARCHITECTURE.md. */

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
