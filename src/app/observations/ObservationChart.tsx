import { useMemo } from "react";
import type { ObservationFrame, ObservationSeries } from "./types";
import { summarizeSeries } from "./seriesSummary";
import { layerTime } from "../layerTime";

const WIDTH = 260;
const HEIGHT = 66;
const metres = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

function trace(entry: ObservationSeries, x: (at: number) => number, y: (v: number) => number) {
  let previous = -Infinity;
  return entry.samples
    .map(([at, value]) => {
      const point = `${x(at).toFixed(1)} ${y(value).toFixed(1)}`;
      const gap = at - previous > (entry.gapAfter ?? Infinity);
      const move = previous === -Infinity || gap;
      previous = at;
      return move ? `M${point}h.01` : `L${point}`;
    })
    .join(" ");
}

export function ObservationChart({
  series,
  at,
  units,
  tide,
  station,
  river,
}: {
  series: readonly ObservationSeries[];
  at: number;
  units?: string | undefined;
  tide?: ObservationFrame["tide"];
  station?: string | undefined;
  river?: boolean;
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
      lines: series.map((entry, index) => ({
        ...entry,
        secondary: entry.secondary ?? index === 1,
        path: trace(entry, x, y),
      })),
    };
  }, [series]);
  if (!chart) return null;
  const cursor = Math.min(WIDTH - 1, Math.max(1, chart.x(at)));
  const bracket = cursor + (cursor < WIDTH / 2 ? 5 : -5);
  const difference = tide?.predicted === undefined ? undefined : tide.observed - tide.predicted;
  const label = (value: number) =>
    `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units ?? ""}`;
  const selected = series
    .find((entry) => entry.id === station && station)
    ?.samples.find(([time]) => time === at);
  return (
    <div className="observation-chart" data-river={river || undefined}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <path d={`M1 1V${HEIGHT - 1}H${WIDTH - 1}`} />
        {chart.lines.map(({ id, label, path, secondary }) => (
          <path
            key={label}
            d={path}
            className="chart-trace"
            data-secondary={secondary || undefined}
            data-active={(station && id === station) || undefined}
          />
        ))}
        <line x1={cursor} x2={cursor} y1="1" y2={HEIGHT - 1} />
        {selected && <circle cx={cursor} cy={chart.y(selected[1])} r="2.75" className="chart-sample" />}
        {tide?.predicted !== undefined && (
          <path
            className="observation-tide-bracket"
            d={`M${cursor} ${chart.y(tide.observed)}H${bracket}V${chart.y(tide.predicted)}H${cursor}`}
          />
        )}
      </svg>
      <div className="observation-chart-key">
        {!river && (
          <span className="chart-series-labels">
            {chart.lines
              .filter(({ path }) => path)
              .map(({ label, secondary }) => (
                <span key={label} data-secondary={secondary || undefined}>
                  <i className="chart-swatch" aria-hidden="true" />
                  {label}
                </span>
              ))}
          </span>
        )}
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
          const exact = river ? entry.samples.find(([t]) => t === at) : undefined;
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
                {river
                  ? exact
                    ? `Selected reading: ${label(exact[1])} · ${layerTime(exact[0])}.`
                    : "No reading at the selected time."
                  : `Nearest recorded sample: ${label(summary.selected[1])} · ${layerTime(summary.selected[0])}.`}
              </p>
            </section>
          );
        })}
      </details>
    </div>
  );
}
