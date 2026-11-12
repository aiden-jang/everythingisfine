import type { Quake } from "../data/types";
import { rampColorAt, type RampName } from "../globe/ramp";
import { QUIET_BAND_KM } from "../geo/boundaryDistance";
import { ago, agoShort, place } from "./format";
export function EarthquakeContext({
  strongest,
  percent,
  shown,
  empty,
  now,
  archived,
  ramp,
  onLargest,
}: {
  strongest: Quake | null;
  percent: number | null;
  shown: number;
  empty: string;
  now: number;
  archived: boolean;
  ramp: RampName;
  onLargest: () => void;
}): JSX.Element {
  return (
    <>
      {!strongest ? (
        <div className="tb-cell tb-wide" data-rail="largest">
          <span className="label block">Largest</span>
          <span className="text-[11px] text-faint">{empty}</span>
        </div>
      ) : null}
      {strongest ? (
        <button
          type="button"
          onClick={onLargest}
          aria-description={
            `Magnitude ${strongest.primary.magnitude.toFixed(1)}, ${ago(strongest.primary.time, now, archived)}. ` +
            "Go there and hold the window at that moment."
          }
          data-rail="largest"
          className="tb-cell tb-wide cursor-pointer text-left transition-colors hover:bg-raised"
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="label">Largest</span>
            <span className="shrink-0 font-mono text-[10.5px] text-faint">
              {agoShort(strongest.primary.time, now, archived)}
            </span>
          </span>
          <span className="flex items-baseline gap-2">
            <span
              data-ramp
              className="font-mono text-[14px] leading-none"
              style={{ color: rampColorAt(ramp, (strongest.primary.magnitude - 1) / 6.5) }}
            >
              {strongest.primary.magnitude.toFixed(1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-dim">
              {place(strongest.primary.place)}
            </span>
          </span>
        </button>
      ) : null}
      {percent === null ? (
        <div className="tb-cell tb-wide">
          <span className="label block">Near plate boundaries</span>
          <span className="text-[11px] text-faint">{shown ? "No events in range" : empty}</span>
        </div>
      ) : null}
      {percent !== null ? (
        <div className="tb-cell tb-wide">
          <span className="label">Near plate boundaries</span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-[13px] tabular-nums text-ink">{percent}%</span>
            <span className="text-[11px] text-dim">within {QUIET_BAND_KM} km</span>
          </span>
        </div>
      ) : null}
    </>
  );
}
