import type { ObservationFrame } from "./types";

export function TideGauge({ tide }: { tide: NonNullable<ObservationFrame["tide"]> }): JSX.Element {
  const height = 120;
  const fill = (level: number) =>
    height * Math.max(0, Math.min(1, (level - tide.min) / (tide.max - tide.min)));
  const steps = Math.min(6, Math.max(2, tide.max - tide.min + 1));
  return (
    <div className="observation-tide-gauge" aria-hidden="true" data-ramp="">
      <span>Gauge level</span>
      <svg viewBox="0 0 80 144">
        <path d="M20 9V129H60V9" />
        <rect
          className="observation-tide-fill"
          x="21"
          y={129 - fill(tide.observed)}
          width="38"
          height={fill(tide.observed)}
        />
        {Array.from({ length: steps }, (_, index) => {
          const position = index / (steps - 1);
          const y = 129 - position * height;
          const level = tide.min + position * (tide.max - tide.min);
          return (
            <g key={index}>
              <path d={`M60 ${y}h6`} />
              <text x="69" y={y + 3}>
                {Number(level.toFixed(1))}
              </text>
            </g>
          );
        })}
        {tide.predicted !== undefined && (
          <line x1="20" x2="60" y1={129 - fill(tide.predicted)} y2={129 - fill(tide.predicted)} />
        )}
      </svg>
      <small>metres · MLLW</small>
    </div>
  );
}
