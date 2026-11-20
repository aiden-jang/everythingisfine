import { useId, useMemo, type ReactNode } from "react";
import type { FloatDiveView } from "./floatPlayback";
import { PROFILE_CHART, profileGeometry, type profileTakeaway } from "./profileGeometry";

export function FloatFinding({
  view,
  finding,
  onClose,
  notice,
  children,
}: {
  view: FloatDiveView;
  finding: ReturnType<typeof profileTakeaway>["finding"];
  onClose: () => void;
  notice: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const { samples } = view.profile;
  const plot = useMemo(() => profileGeometry(samples, "temperature"), [samples]);
  const point = plot.points[finding.index]!;
  const { width, height, left, right, top, bottom } = PROFILE_CHART;
  return (
    <section
      className={notice ? "float-takeaway" : undefined}
      aria-label={notice ? "What this profile showed" : undefined}
    >
      {notice && (
        <>
          <h3>{finding.heading}</h3>
          <p>{finding.reading}</p>
        </>
      )}
      {children}
      {notice && (
        <>
          <svg
            className="float-finding-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={`${id}-title ${id}-description`}
          >
            <title id={`${id}-title`}>Temperature through this water column</title>
            <desc id={`${id}-description`}>
              {samples.length} measured samples. {finding.reading} Depth increases downward.
            </desc>
            {[0, 0.5, 1].map((fraction) => {
              const y = top + fraction * (bottom - top);
              return (
                <g key={fraction}>
                  <path d={`M${left} ${y}H${right}`} className="float-profile-grid" />
                  <text x={left - 8} y={y + 4} textAnchor="end">
                    {Math.round(plot.deepest * fraction).toLocaleString()}
                  </text>
                  <text x={left + fraction * (right - left)} y="187" textAnchor="middle">
                    {(plot.low + fraction * (plot.high - plot.low)).toFixed(1)}
                  </text>
                </g>
              );
            })}
            <text x={left} y="13">
              Depth (m)
            </text>
            <text x={(left + right) / 2} y="209" textAnchor="middle">
              Temperature (°C)
            </text>
            <polyline
              pathLength="1"
              points={plot.line}
              className="float-profile-line"
              data-field="temperature"
            />
            <path d={`M${left} ${point.y}H${right}`} className="float-profile-selection" />
            <text
              x={point.x}
              y={point.y < top + 20 ? point.y + 18 : point.y - 10}
              textAnchor={point.x > (left + right) / 2 ? "end" : "start"}
            >
              {Math.round(samples[finding.index]!.depth).toLocaleString()} m
            </text>
            <circle cx={point.x} cy={point.y} r="4.5" className="float-finding-sample" />
          </svg>
          <small>{samples.length.toLocaleString()} measured samples. One location and one date.</small>
          <div className="float-finding-actions">
            <button
              type="button"
              onClick={() => {
                view.seek(finding.index);
                view.inspect(true);
              }}
            >
              Inspect this sample
            </button>
            <button type="button" onClick={onClose}>
              Return to your place
            </button>
          </div>
        </>
      )}
    </section>
  );
}
