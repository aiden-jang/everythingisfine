import type { ObservationSeries } from "./types";

export function summarizeSeries(series: ObservationSeries, at: number) {
  let first: readonly [number, number] | undefined;
  let last: readonly [number, number] | undefined;
  let selected: readonly [number, number] | undefined;
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const point of series.samples) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    count++;
    if (!first || point[0] < first[0]) first = point;
    if (!last || point[0] > last[0]) last = point;
    if (!selected || Math.abs(point[0] - at) < Math.abs(selected[0] - at)) selected = point;
    min = Math.min(min, point[1]);
    max = Math.max(max, point[1]);
  }
  if (!first || !last || !selected) return null;
  return { first, last, selected, min, max, count };
}
