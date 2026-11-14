import type { FeedRow } from "./feedStatus";
import { layerHealth, layerMetadata } from "./layerMetadata";
import type { MapLayer } from "./layerVisibility";

export function quietLayer(
  layer: MapLayer,
  rows: readonly FeedRow[],
  count?: number,
  archived = false,
): string | null {
  const health = archived ? null : layerHealth(layer, rows);
  if (health) return health;
  const answered =
    archived ||
    layerMetadata[layer].sources.some((id) => rows.some((row) => row.id === id && row.state === "ok"));
  if (!answered) return "Waiting for source data…";
  if (count === 0 && layer === "wind") return "No wind vectors in this forecast step";
  if (count === 0 && layer === "aurora") return "No modeled auroral activity in this forecast";
  if (count === 0)
    return layer === "lightning"
      ? "No detections in this scan · GOES-East coverage only"
      : "No matching reports in this time window";
  if (layer === "radar") return "Coverage varies · blank does not always mean dry";
  if (layer === "lightning") return "GOES-East coverage only";
  if (layer === "aurora") return "Polar forecast · check near the poles";
  return null;
}
