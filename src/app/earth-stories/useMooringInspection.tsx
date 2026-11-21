import { useCallback, useMemo, useRef, useState } from "react";
import { EvidenceConnector } from "../observations/EvidenceConnector";
import type { ObservationView, MooringSection } from "../observations/types";
import type { StoryFrame } from "./types";

type Buoy = { lon: number; lat: number };
const NO_BUOYS: Buoy[] = [];
const longitude = (lon: number) =>
  lon === 0 || Math.abs(lon) === 180 ? `${Math.abs(lon)}°` : `${Math.abs(lon)}° ${lon < 0 ? "W" : "E"}`;

export function useMooringInspection(
  section: MooringSection | undefined,
  frames: readonly StoryFrame[],
  chapter: string | undefined,
  pause: () => void,
) {
  const buoys = useMemo(() => {
    if (!frames[0]?.moorings) return NO_BUOYS;
    const sites = new Set(frames.flatMap((frame) => frame.moorings?.readings.map(({ lon }) => lon) ?? []));
    return [...sites].sort((a, b) => ((a + 360) % 360) - ((b + 360) % 360)).map((lon) => ({ lon, lat: 0 }));
  }, [frames]);
  const [selected, select] = useState<number | undefined>(() => {
    if (!chapter?.startsWith("mooring:")) return undefined;
    const lon = Number(chapter.split(":")[1]);
    return buoys.some((buoy) => buoy.lon === lon) ? lon : undefined;
  });
  const [show, setShow] = useState(
    chapter === "moorings" || (selected !== undefined && !chapter?.endsWith(":hidden")),
  );
  const details = useRef<HTMLDetailsElement>(null);
  const reading = useRef<HTMLParagraphElement>(null);
  const observed = useMemo(() => new Set(section?.readings.map(({ lon }) => lon)), [section]);
  const current = selected ?? buoys.find((buoy) => observed.has(buoy.lon))?.lon;
  const rows = useMemo(
    () => section?.readings.filter(({ lon }) => lon === current).sort((a, b) => a.depth - b.depth),
    [section, current],
  );
  const inspect = useCallback(
    (lon: number) => {
      pause();
      select(lon);
      setShow(true);
      requestAnimationFrame(() => {
        if (details.current) details.current.open = true;
        reading.current?.scrollIntoView({ block: "nearest" });
      });
    },
    [pause],
  );
  const picks = useMemo<ObservationView["pickMarks"]>(
    () => (buoys.length ? { points: buoys, select: (index) => inspect(buoys[index]!.lon) } : undefined),
    [buoys, inspect],
  );
  return {
    visible: show ? section : undefined,
    selected: show ? selected : undefined,
    chapter:
      selected === undefined ? (show ? "moorings" : "") : `mooring:${selected}${show ? "" : ":hidden"}`,
    picks,
    labels: section && (
      <>
        <div className="nino-moorings" aria-label="Pacific buoys">
          {buoys.map(({ lon, lat }) => (
            <button
              key={lon}
              type="button"
              data-observation-anchor=""
              data-compact-anchor=""
              data-lon={lon}
              data-lat={lat}
              data-mooring-gap={!observed.has(lon) || undefined}
              data-evidence-source={show && selected === lon ? "true" : undefined}
              data-projection-anchor={(show && selected === lon) || undefined}
              aria-label={`Inspect buoy ${longitude(lon)}`}
              aria-pressed={show && selected === lon}
              onClick={() => inspect(lon)}
            >
              <span aria-hidden="true">{longitude(lon)}</span>
            </button>
          ))}
        </div>
        {show && selected !== undefined && <EvidenceConnector key={selected} trace />}
      </>
    ),
    controls: section && (
      <div data-evidence-body="">
        <div className="observatory-actions">
          <button
            type="button"
            aria-pressed={show}
            onClick={() => {
              if (!show) pause();
              setShow(!show);
            }}
          >
            Show measured depths
          </button>
        </div>
        {show && (
          <>
            <p className="observation-note">Dots mark depths with a recorded monthly mean.</p>
            <details ref={details} className="observation-details" open={selected !== undefined || undefined}>
              <summary>Read monthly means</summary>
              <label className="observation-picker">
                <span>Mooring longitude</span>
                <select value={current} onChange={(event) => inspect(Number(event.currentTarget.value))}>
                  {buoys.map(({ lon }) => (
                    <option key={lon} value={lon}>
                      {longitude(lon)}
                    </option>
                  ))}
                </select>
              </label>
              <p ref={reading} className="observation-note" data-evidence-point="">
                {current !== undefined && longitude(current)} · Monthly temperatures
              </p>
              {rows?.length ? (
                <dl className="observation-values">
                  {rows.map(({ depth, temperature, days }) => (
                    <div key={depth}>
                      <dt>{depth} m</dt>
                      <dd>
                        {temperature.toFixed(2)} °C · {days} days
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="observation-note">No usable readings at this buoy this month.</p>
              )}
            </details>
          </>
        )}
      </div>
    ),
  };
}
