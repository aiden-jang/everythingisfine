import { useState } from "react";
import type { MooringSection } from "../observations/types";

function MooringReadings({ section }: { section: MooringSection }): JSX.Element {
  const [requestedLon, select] = useState<number>();
  const sites = [...new Set(section.readings.map((r) => r.lon))].sort(
    (a, b) => ((a + 360) % 360) - ((b + 360) % 360),
  );
  const selected = requestedLon !== undefined && sites.includes(requestedLon) ? requestedLon : sites[0];
  return (
    <details className="observation-details">
      <summary>Read monthly means</summary>
      <label className="observation-picker">
        <span>Mooring longitude</span>
        <select value={selected} onChange={(e) => select(Number(e.currentTarget.value))}>
          {sites.map((lon) => (
            <option key={lon} value={lon}>
              {Math.abs(lon)}°{Math.abs(lon) === 180 ? "" : lon < 0 ? " W" : " E"}
            </option>
          ))}
        </select>
      </label>
      <dl className="observation-values">
        {section.readings
          .filter((r) => r.lon === selected)
          .sort((a, b) => a.depth - b.depth)
          .map((r) => (
            <div key={r.depth}>
              <dt>{r.depth} m</dt>
              <dd>
                {r.temperature.toFixed(2)} °C · {r.days} days
              </dd>
            </div>
          ))}
      </dl>
    </details>
  );
}

export function useMooringInspection(section: MooringSection | undefined, pause: () => void) {
  const [show, setShow] = useState(false);
  return {
    visible: show ? section : undefined,
    controls: section && (
      <>
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
            <p className="observation-note">Each dot marks a sensor depth with a monthly mean.</p>
            <MooringReadings section={section} />
          </>
        )}
      </>
    ),
  };
}
