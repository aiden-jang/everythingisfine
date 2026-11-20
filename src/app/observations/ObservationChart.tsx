import { useMemo } from "react";
import type { ObservationFrame, ObservationSeries } from "./types";
import { summarizeSeries } from "./seriesSummary";
import { layerTime } from "../layerTime";

const WIDTH = 260;
const HEIGHT = 66;
const metres = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function ObservationChart({
  series,
  at,
  units,
  tide,
}: {
  series: readonly ObservationSeries[];
  at: number;
  units?: string | undefined;
  tide?: ObservationFrame["tide"];
}): JSX.Element | null {
  const chart = useMemo(() => {
    const points = series.flatMap(({ samples }) => samples);
    if (!points.length) return null;
    const start = Math.min(...points.map(([t]) => t));
    const end = Math.max(...points.map(([t]) => t));
    const min = Math.min(...points.map(([, value]) => value));
    const max = Math.max(...points.map(([, value]) => value));
    const x = (time: number) => 1 + ((WIDTH - 2) * (time - start)) / (end - start || 1);
    const y = (value: number) => HEIGHT - 3 - ((HEIGHT - 6) * (value - min)) / (max - min || 1);
    return {
      x,
      y,
      min,
      max,
      lines: series.map(({ label, samples }) => ({
        label,
        path: samples.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
      })),
    };
  }, [series]);
  if (!chart) return null;
  const cursor = Math.min(WIDTH - 1, Math.max(1, chart.x(at)));
  const bracket = cursor + (cursor < WIDTH / 2 ? 5 : -5);
  const difference = tide?.predicted === undefined ? undefined : tide.observed - tide.predicted;
  const label = (value: number) =>
    `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units ?? ""}`;
  return (
    <div className="observation-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <path d={`M1 1V${HEIGHT - 1}H${WIDTH - 1}`} />
        {chart.lines.map(({ label: key, path }) => (
          <polyline key={key} points={path} />
        ))}
        <line x1={cursor} x2={cursor} y1="1" y2={HEIGHT - 1} />
        {tide?.predicted !== undefined && (
          <path
            className="observation-tide-bracket"
            d={`M${cursor} ${chart.y(tide.observed)}H${bracket}V${chart.y(tide.predicted)}H${cursor}`}
          />
        )}
      </svg>
      <div className="observation-chart-key">
        <span>
          {chart.lines
            .filter(({ path }) => path)
            .map(({ label: key }) => key)
            .join(" · ")}
        </span>
        <span>
          {label(chart.min)} to {label(chart.max)}
        </span>
      </div>
      {tide && (
        <p className="observation-tide-difference">
          {difference === undefined
            ? "No matching prediction"
            : difference === 0
              ? "Observed level matches prediction"
              : `${metres.format(Math.abs(difference))} m ${difference > 0 ? "above" : "below"} prediction`}
        </p>
      )}
      <details className="observation-details">
        <summary>Read the chart</summary>
        {series.map((entry) => {
          const summary = summarizeSeries(entry, at);
          if (!summary) return null;
          return (
            <section key={entry.label} aria-label={entry.label}>
              <h3>{entry.label}</h3>
              <p>
                {summary.count} samples. From {label(summary.first[1])} at {layerTime(summary.first[0])}
                {" to "}
                {label(summary.last[1])} at {layerTime(summary.last[0])}.{" Range: "}
                {label(summary.min)} to {label(summary.max)}.
              </p>
              <p>
                Nearest recorded sample: {label(summary.selected[1])} · {layerTime(summary.selected[0])}.
              </p>
            </section>
          );
        })}
      </details>
    </div>
  );
}
