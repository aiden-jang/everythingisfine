import { useCallback, useMemo, useState } from "react";
import type { GeoPoint, ObservationTerrain } from "../observations/types";
import { distanceKm } from "../../geo/sphere";
import { terrainSample, readTerrainSection, sectionSamples, type TerrainLine } from "./terrainSection";

const preset: TerrainLine = [
  { lon: 141.6, lat: 10.7 },
  { lon: 142.9, lat: 12 },
];

export function useTerrainSection(
  grid: ObservationTerrain | undefined,
  initial: string | undefined,
  openMap: () => void,
) {
  const [line, setLine] = useState<TerrainLine | null>(() =>
    grid ? readTerrainSection(initial, grid) : null,
  );
  const [start, setStart] = useState<GeoPoint | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hint, setHint] = useState("");
  const pick = useCallback(
    (point: GeoPoint) => {
      if (!grid || !terrainSample(grid, point.lon, point.lat)) {
        setHint("Choose a point inside the colored terrain.");
        return;
      }
      const rounded = { lon: Number(point.lon.toFixed(4)), lat: Number(point.lat.toFixed(4)) };
      if (!start) {
        setStart(rounded);
        setHint("Choose the other end of your section.");
      } else {
        if (distanceKm(start.lon, start.lat, rounded.lon, rounded.lat) < 1) {
          setHint("Choose a point farther away.");
          return;
        }
        setLine([start, rounded]);
        setStart(null);
        setDrawing(false);
        setHint("");
      }
    },
    [grid, start],
  );
  const samples = useMemo(() => (grid && line ? sectionSamples(grid, line) : null), [grid, line]);
  const paths = useMemo(() => (line ? [{ points: line, color: 0xf0dbad }] : []), [line]);
  const marks = useMemo(() => (start ? [{ ...start, size: 10, color: 0xf0dbad }] : []), [start]);
  const select = (next: TerrainLine | null) => {
    setLine(next);
    setStart(null);
    setDrawing(false);
    setHint("");
  };
  return {
    pick: drawing ? pick : undefined,
    paths,
    marks,
    chapter: line ? `section:${line.flatMap((p) => [p.lon, p.lat]).join(",")}` : "",
    controls: grid ? (
      <>
        <div className="observatory-actions">
          <button
            type="button"
            aria-pressed={drawing}
            onClick={() => {
              if (drawing) {
                setDrawing(false);
                setStart(null);
                setHint("");
                return;
              }
              openMap();
              setDrawing(true);
              setStart(null);
              setHint("Choose two points inside the terrain to measure a depth section.");
            }}
          >
            {drawing ? "Cancel section" : "Measure a depth section"}
          </button>
          <button
            type="button"
            onClick={() => {
              openMap();
              select(preset);
            }}
          >
            Across Challenger Deep
          </button>
          {line && (
            <button type="button" onClick={() => select(null)}>
              Clear section
            </button>
          )}
        </div>
        <details className="terrain-coordinates">
          <summary>Enter section coordinates</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const next = readTerrainSection(
                `section:${["start-lon", "start-lat", "end-lon", "end-lat"].map((name) => values.get(name)).join(",")}`,
                grid,
              );
              if (!next) {
                setHint("Use two points at least 1 km apart inside the mapped terrain.");
                return;
              }
              openMap();
              select(next);
            }}
          >
            {[
              ["Start longitude", "start-lon", preset[0].lon, grid.bounds[0], grid.bounds[2]],
              ["Start latitude", "start-lat", preset[0].lat, grid.bounds[1], grid.bounds[3]],
              ["End longitude", "end-lon", preset[1].lon, grid.bounds[0], grid.bounds[2]],
              ["End latitude", "end-lat", preset[1].lat, grid.bounds[1], grid.bounds[3]],
            ].map(([label, name, value, min, max]) => (
              <label key={String(name)}>
                {label}
                <input
                  name={String(name)}
                  type="number"
                  step="any"
                  required
                  min={Number(min)}
                  max={Number(max)}
                  defaultValue={Number(value)}
                />
              </label>
            ))}
            <button type="submit">Show section</button>
          </form>
        </details>
        {hint && (
          <p role="status" className="observation-note">
            {hint}
          </p>
        )}
      </>
    ) : null,
    overlay: samples ? (
      <figure className="terrain-section">
        <figcaption>Seafloor along your section · sampled GEBCO depths</figcaption>
        <svg
          viewBox="0 0 340 150"
          role="img"
          aria-label={`Depth section across ${Math.round(samples.at(-1)!.km)} kilometres`}
        >
          <path d="M38 12V120H332" fill="none" stroke="currentColor" opacity=".5" />
          {[0, 5, 10].map((km) => (
            <text key={km} x="1" y={18 + km * 9}>
              {km} km
            </text>
          ))}
          <path
            d={samples
              .map(
                (p, i) =>
                  `${i ? "L" : "M"}${38 + i * 2.9},${12 + (Math.max(0, -(p.meters ?? 0)) / 1000) * 9}`,
              )
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <text x="38" y="143">
            0
          </text>
          <text x="332" y="143" textAnchor="end">
            {Math.round(samples.at(-1)!.km)} km
          </text>
        </svg>
      </figure>
    ) : null,
  };
}
