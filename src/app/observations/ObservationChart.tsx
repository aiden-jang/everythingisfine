import { useMemo } from "react";
import type { ObservationSeries } from "./types";

const WIDTH = 260;
const HEIGHT = 66;

export function ObservationChart({
  series,
  at,
  units,
}: {
  series: readonly ObservationSeries[];
  at: number;
  units?: string | undefined;
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
      min,
      max,
      lines: series.map(({ label, samples }) => ({
        label,
        path: samples.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
      })),
    };
  }, [series]);
  if (!chart) return null;
  const label = (value: number) =>
    `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units ?? ""}`;
  return (
    <div className="observation-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <path d={`M1 1V${HEIGHT - 1}H${WIDTH - 1}`} />
        {chart.lines.map(({ label: key, path }) => (
          <polyline key={key} points={path} />
        ))}
        <line
          x1={Math.min(WIDTH - 1, Math.max(1, chart.x(at)))}
          x2={Math.min(WIDTH - 1, Math.max(1, chart.x(at)))}
          y1="1"
          y2={HEIGHT - 1}
        />
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
    </div>
  );
}
