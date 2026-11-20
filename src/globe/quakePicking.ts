import { matches } from "../data/filter";
import type { Store } from "../data/store";
import type { Filters } from "../data/types";
import { distanceKm } from "../geo/sphere";
import type { Controls } from "./controls";
import { sinkFraction } from "./events";

/* Tiny earthquake markers need a few extra pixels of tolerance. */
export const HIT_SLOP_PX = 4;

export type MarkerHit = { id: string; score: number };

export type HitStore = Pick<Store, "forEach">;

/* Nearest on the sphere is not nearest on screen near the limb, so project a shortlist. */
const SHORTLIST = 8;

export function pickQuake(
  clientX: number,
  clientY: number,
  store: HitStore,
  filters: Filters,
  now: number,
  slopPx: number,
  controls: Controls,
  sink: number,
  includesTime: (time: number) => boolean,
  radiusOf: (magnitude: number) => number,
  hits?: MarkerHit[],
): string | null {
  const under = controls.pick(clientX, clientY);
  if (!under) return null;
  const near: { key: string; lon: number; lat: number; magnitude: number; depthKm: number }[] = [];
  let worst = Infinity;
  store.forEach((quake) => {
    if (!matches(quake, filters, now) || !includesTime(quake.primary.time)) return;
    const { lon, lat, magnitude, depthKm } = quake.primary;
    const km = distanceKm(under.lon, under.lat, lon, lat);
    if (near.length >= SHORTLIST && km >= worst) return;
    near.push({ key: quake.key, lon, lat, magnitude, depthKm });
    near.sort(
      (a, b) =>
        distanceKm(under.lon, under.lat, a.lon, a.lat) - distanceKm(under.lon, under.lat, b.lon, b.lat),
    );
    if (near.length > SHORTLIST) near.pop();
    const last = near[near.length - 1]!;
    worst = distanceKm(under.lon, under.lat, last.lon, last.lat);
  });
  let bestKey: string | null = null;
  let bestScore = Infinity;
  for (const candidate of near) {
    // Pick at the drawn depth, not the epicentre above it; flat projection has no sink.
    const at = controls.project(
      candidate.lon,
      candidate.lat,
      1 - sinkFraction(candidate.depthKm) * sink * (1 - controls.morph()),
    );
    if (!at) continue;
    const d = Math.hypot(at.x - clientX, at.y - clientY);
    // Use the shader's radius so picking cannot drift from the drawing.
    const radius = radiusOf(candidate.magnitude);
    if (d > radius + slopPx) continue;
    // Ranked by how far outside the marker the pointer is, so a big marker does not win simply for
    // being big when the pointer is squarely inside a small one on top of it.
    const score = d - radius;
    hits?.push({ id: candidate.key, score });
    if (score < bestScore) {
      bestScore = score;
      bestKey = candidate.key;
    }
  }
  return bestKey;
}
