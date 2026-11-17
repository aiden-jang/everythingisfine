import type { ReactNode } from "react";
import { FIXES, LANDFALL, START, TRACK_MINUTES, stormClock } from "./stormTrack";

export const PEAK = FIXES.reduce((peak, fix) => (fix.wind > peak.wind ? fix : peak));
export const PEAK_MINUTE = (PEAK.time - START) / 60_000;
export const PEAK_INDEX = FIXES.indexOf(PEAK);
const point = (fix: (typeof FIXES)[number]) => ({
  x: 34 + ((fix.time - START) / (TRACK_MINUTES * 60_000)) * 282,
  y: 126 - ((fix.wind - 90) / 70) * 98,
});

export function StormInvitation({ onFollow }: { onFollow: () => void }) {
  return (
    <div className="storm-invitation" data-storm-phase="intro">
      <h3>Across the Gulf.</h3>
      <p>
        Katrina crossed the Gulf before reaching Louisiana. Where along its track were the winds strongest?
      </p>
      <button type="button" className="storm-follow" onClick={onFollow}>
        Follow the storm
      </button>
      <p className="storm-invitation-source">NOAA’s recorded positions · 28–29 August 2005</p>
    </div>
  );
}

export function StormFinding({
  selected,
  onInspect,
  readings,
  actions,
}: {
  selected: number;
  onInspect: (minute: number) => void;
  readings: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="storm-finding" aria-label="What this track showed" data-storm-phase="finding">
      <h3>Two points. One storm.</h3>
      <p>Compare the strongest offshore winds with the reading at landfall near Buras, Louisiana.</p>
      {readings}
      <div className="storm-finding-actions" role="group" aria-label="Compare two recorded positions">
        <button
          type="button"
          aria-label="Inspect offshore peak"
          aria-pressed={selected === PEAK_INDEX}
          onClick={() => onInspect(PEAK_MINUTE)}
        >
          <strong>{PEAK.wind} kt</strong> <span>Offshore peak</span>
        </button>
        <button
          type="button"
          aria-label="Inspect landfall"
          aria-pressed={selected === FIXES.length - 1}
          onClick={() => onInspect(TRACK_MINUTES)}
        >
          <strong>{LANDFALL.wind} kt</strong> <span>Buras landfall</span>
        </button>
      </div>
      {actions}
      <details className="storm-records">
        <summary>All seven recorded positions</summary>
        <figure className="storm-wind-chart">
          <figcaption>Maximum sustained wind · kt</figcaption>
          <svg viewBox="0 0 350 160" role="img" aria-label="Katrina’s seven recorded wind readings">
            <title>NOAA best-track winds, 28–29 August 2005</title>
            {[100, 125, 150].map((wind) => {
              const y = point({ ...PEAK, wind }).y;
              return (
                <g key={wind}>
                  <line x1="34" x2="316" y1={y} y2={y} />
                  <text x="25" y={y + 4} textAnchor="end">
                    {wind}
                  </text>
                </g>
              );
            })}
            <polyline points={FIXES.map((fix) => `${point(fix).x},${point(fix).y}`).join(" ")} />
            {FIXES.map((fix) => (
              <circle key={fix.at} cx={point(fix).x} cy={point(fix).y} r={fix === FIXES[selected] ? 5 : 3.5}>
                <title>{`${stormClock(fix.time)}: ${fix.wind} kt`}</title>
              </circle>
            ))}
            <text
              x={point(PEAK).x}
              y={point(PEAK).y - 12}
              textAnchor="middle"
              className="storm-chart-reading"
            >
              {PEAK.wind} offshore
            </text>
            <text x="316" y={point(LANDFALL).y - 12} textAnchor="end" className="storm-chart-reading">
              {LANDFALL.wind} landfall
            </text>
            <text x="34" y="153">
              28 Aug 00:00
            </text>
            <text x="316" y="153" textAnchor="end">
              29 Aug 11:10 UTC
            </text>
          </svg>
          <p>Seven recorded positions. Lines join readings; they do not add wind measurements.</p>
        </figure>
        <ul>
          {FIXES.map((fix) => (
            <li key={fix.at}>
              <button type="button" onClick={() => onInspect((fix.time - START) / 60_000)}>
                <time dateTime={fix.at}>{stormClock(fix.time)}</time>
                <span>
                  {fix.wind} kt · {fix.pressure} hPa
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
      <p className="storm-finding-context">This track does not map local flooding or damage.</p>
    </section>
  );
}
