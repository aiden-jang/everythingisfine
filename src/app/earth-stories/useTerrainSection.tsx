import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GeoPoint, ObservationTerrain } from "../observations/types";
import { distanceKm } from "../../geo/sphere";
import {
  terrainSample,
  readTerrainSection,
  seafloorFlight,
  sectionSamples,
  type TerrainLine,
} from "./terrainSection";
import { TerrainProfile } from "./TerrainProfile";

const preset: TerrainLine = [
  { lon: 141.6, lat: 10.7 },
  { lon: 142.9, lat: 12 },
];

export function useTerrainSection(
  grid: ObservationTerrain | undefined,
  initial: string | undefined,
  openMap: () => void,
  completed: boolean,
) {
  const [custom, setLine] = useState<TerrainLine | null | undefined>(() =>
    grid ? (readTerrainSection(initial, grid) ?? undefined) : undefined,
  );
  const line = custom === undefined ? (completed && grid ? seafloorFlight : null) : custom;
  const [index, setIndex] = useState(() => {
    const value = Number(initial?.split(":")[2]);
    return Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined;
  });
  const [start, setStart] = useState<GeoPoint | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hint, setHint] = useState("");
  const chart = useRef<HTMLElement>(null);
  const displayedLine = useRef(line);
  useLayoutEffect(() => {
    if (line && line !== displayedLine.current) chart.current?.scrollIntoView({ block: "nearest" });
    displayedLine.current = line;
  }, [line]);
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
        setIndex(undefined);
        setStart(null);
        setDrawing(false);
        setHint("");
      }
    },
    [grid, start],
  );
  const samples = useMemo(() => (grid && line ? sectionSamples(grid, line) : null), [grid, line]);
  const active = index ?? (line === seafloorFlight ? 100 : 0);
  const paths = useMemo(
    () =>
      samples
        ? [{ points: samples.map(({ lon, lat }) => ({ lon, lat, lift: 0.066 })), color: 0xf0dbad }]
        : [],
    [samples],
  );
  const marks = useMemo(() => {
    const point = start ?? samples?.[active];
    return point ? [{ lon: point.lon, lat: point.lat, lift: 0.073, size: 16, color: 0xf0dbad }] : [];
  }, [active, samples, start]);
  const select = (next: TerrainLine | null) => {
    setLine(next);
    setIndex(undefined);
    setStart(null);
    setDrawing(false);
    setHint("");
  };
  return {
    pick: drawing ? pick : undefined,
    paths,
    marks,
    inspecting: !!line,
    chapter: line
      ? `section:${line === seafloorFlight ? "flight" : line.flatMap((p) => [p.lon, p.lat]).join(",")}:${active}`
      : "",
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
    chart: samples ? (
      <TerrainProfile
        chart={chart}
        samples={samples}
        index={active}
        select={setIndex}
        flight={line === seafloorFlight}
      />
    ) : null,
  };
}
