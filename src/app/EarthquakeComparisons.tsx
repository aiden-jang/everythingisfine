import {
  BASELINE_DAYS,
  BASELINE_FROM,
  BASELINE_MIN_MAGNITUDE,
  BASELINE_TO,
  BASELINE_WEEKS,
  sharePercent,
  type Span as BaselineSpan,
  type rankDay,
} from "../data/baseline";
import { recordWhen, SINCE, UNTIL, type Superlative } from "./superlative";
import { timesLabel, type Versus } from "./versus";
import { energyPercent } from "./format";

export function EarthquakeComparisons({
  energyShare,
  baseline,
  baselineSpan,
  ceiling,
  versus,
}: {
  energyShare: number | null;
  baseline: ReturnType<typeof rankDay>;
  baselineSpan: BaselineSpan | null;
  ceiling: Superlative | null;
  versus: Versus | null;
}): JSX.Element {
  return (
    <>
      {energyShare !== null && energyShare > 0.5 ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          That one event is <span className="text-dim tabular-nums">{energyPercent(energyShare)}</span> of the
          energy released in the window. Magnitude is logarithmic: two points of it is a thousand times the
          energy.
        </p>
      ) : null}
      {baseline ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          <span className="text-dim tabular-nums">{baseline.count}</span>
          {" at M"}
          <span className="tabular-nums">{BASELINE_MIN_MAGNITUDE}</span>
          {"+: "}
          {baseline.direction} than{" "}
          <span className="text-dim tabular-nums">{sharePercent(baseline.share)}%</span> of the{" "}
          <span className="tabular-nums">
            {(baselineSpan === "week" ? BASELINE_WEEKS : BASELINE_DAYS).toLocaleString("en")}
          </span>{" "}
          {baselineSpan === "week" ? "weeks" : "days"} from {BASELINE_FROM} to {BASELINE_TO}.
        </p>
      ) : null}
      {ceiling ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          {ceiling.beaten ? (
            <>
              {"Larger than anything in "}
              {ceiling.region}
              {" from "}
              {SINCE}
              {" to "}
              {UNTIL}
              {". Previous best: M"}
              <span className="text-dim tabular-nums">{ceiling.record.toFixed(1)}</span>
              {", "}
              {recordWhen(ceiling.day)}
              {"."}
            </>
          ) : (
            <>
              {"Largest in "}
              {ceiling.region}
              {", "}
              {SINCE}
              {" to "}
              {UNTIL}
              {": M"}
              <span className="text-dim tabular-nums">{ceiling.record.toFixed(1)}</span>
              {", "}
              {recordWhen(ceiling.day)}
              {"."}
            </>
          )}
        </p>
      ) : null}
      {versus ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          {versus.exceeded
            ? "This window has released "
            : `${versus.day.what}, ${versus.day.day.slice(0, 4)}, released `}
          <span className="text-dim tabular-nums">{timesLabel(versus.times)}</span>
          {versus.exceeded
            ? ` times the energy of ${versus.day.what} in ${versus.day.day.slice(0, 4)}, the largest ever recorded.`
            : " times the energy of everything in this window, from one earthquake."}
        </p>
      ) : null}
    </>
  );
}
