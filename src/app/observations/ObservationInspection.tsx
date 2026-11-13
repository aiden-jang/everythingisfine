import { useCallback, useState } from "react";
import type { GeoPoint, ObservationFrame, ObservationMark } from "./types";
import { distanceKm } from "../../geo/sphere";
import { layerTime } from "../layerTime";

export function closestMeasurement(marks: readonly ObservationMark[], point: GeoPoint) {
  let closest: ObservationMark | undefined;
  let distance = 100;
  for (const mark of marks) {
    if (!mark.reading) continue;
    const km = distanceKm(point.lon, point.lat, mark.lon, mark.lat);
    if (km < distance) {
      distance = km;
      closest = mark;
    }
  }
  return closest ? { mark: closest, distance } : null;
}

export function useObservationInspection(frame: ObservationFrame | undefined) {
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const pick = useCallback((next: GeoPoint) => setPoint(next), []);
  const selected = frame && point ? closestMeasurement(frame.marks ?? [], point) : null;
  return { pick, point, selected, clear: () => setPoint(null) };
}

export function ObservationInspection({
  frame,
  inspection,
  source,
}: {
  frame: ObservationFrame;
  inspection: ReturnType<typeof useObservationInspection>;
  source: string;
}) {
  const marks = frame.marks?.filter((mark) => mark.reading) ?? [];
  if (!marks.length) return null;
  const selected = inspection.selected;
  return (
    <section className="measurement-inspector" aria-label="Inspect observations">
      <label className="observation-picker">
        <span>Inspect a monitor</span>
        <select
          value={selected?.mark.reading?.label ?? ""}
          onChange={(event) => {
            const mark = marks.find((item) => item.reading?.label === event.currentTarget.value);
            if (mark) inspection.pick(mark);
            else inspection.clear();
          }}
        >
          <option value="">Select here or tap a marker</option>
          {marks.map((mark) => (
            <option key={mark.reading!.label}>{mark.reading!.label}</option>
          ))}
        </select>
      </label>
      {inspection.point && (
        <div role="status">
          {selected ? (
            <>
              <strong>{selected.mark.reading!.value}</strong>
              <p>{selected.mark.reading!.label}</p>
              <small>
                {source} · {layerTime(frame.at)}
              </small>
              {selected.distance > 1 && (
                <p>Nearest monitor, {Math.round(selected.distance)} km from your selection.</p>
              )}
            </>
          ) : (
            <p>No reporting monitor within 100 km of that point. This does not mean the air is clean.</p>
          )}
        </div>
      )}
    </section>
  );
}
