import type { ObservationView } from "../app/observations/types";

export function newObservationPlace(next: ObservationView | null, previous: ObservationView | null) {
  if (!next || !previous) return next !== previous;
  if (next.cameraKey !== previous.cameraKey) return true;
  const a = next.target,
    b = previous.target;
  const turn = a.lon - b.lon - Math.round((a.lon - b.lon) / 360) * 360;
  return Math.abs(turn) > 0.01 || Math.abs(a.lat - b.lat) > 0.01 || Math.abs(a.zoom - b.zoom) > 0.001;
}
