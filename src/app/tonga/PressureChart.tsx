import { pressureAt, stations, timeIso, timeLabel } from "./tongaTimeline";

type Station = (typeof stations)[number];
const width = 284;
const height = 60;
const inset = 5;

const charts = stations.map((station) => {
  const points = station.values.map((_, i) => pressureAt(station, station.start + i));
  const values = points.filter((value): value is number => value !== null);
  const low = Math.floor(Math.min(...values));
  const high = Math.ceil(Math.max(...values));
  const x = (offset: number) => inset + (offset / (points.length - 1)) * (width - inset * 2);
  const y = (value: number) => inset + ((high - value) / (high - low || 1)) * (height - inset * 2);
  const path = points
    .map((value, i) =>
      value === null ? "" : `${i > 0 && points[i - 1] !== null ? "L" : "M"}${x(i)} ${y(value)}`,
    )
    .join("");
  return { x, y, path, low, high };
});

export function PressureChart({ station, minute }: { station: Station; minute: number }): JSX.Element {
  const { x, y, path, low, high } = charts[stations.indexOf(station)]!;
  const reading = pressureAt(station, minute);
  const end = station.start + station.values.length - 1;
  const cursor = x(Math.floor(minute) - station.start);
  const peak = x(station.peak - station.start);

  return (
    <div className="tonga-chart">
      <div className="tonga-chart-meta">
        <span>Station pressure</span>
        <span>
          {minute < station.start || minute >= end + 1
            ? `This station’s readings cover ${timeLabel(station.start)}–${timeLabel(end)} UTC`
            : reading === null
              ? "No reading at this minute"
              : `${reading.toFixed(2)} hPa`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${station.name} one-minute pressure readings from ${timeLabel(station.start)} to ${timeLabel(end)} UTC. Scale ${low} to ${high} hectopascals.`}
      >
        <path
          d={`M0 ${inset}H${width}M0 ${height / 2}H${width}M0 ${height - inset}H${width}`}
          className="tonga-chart-grid"
        />
        <path d={`M${peak} 0V${height}`} className="tonga-chart-peak" />
        <path d={path} className="tonga-chart-trace" data-ramp="" />
        {reading !== null && (
          <>
            <path d={`M${cursor} 0V${height}`} className="tonga-chart-cursor" />
            <circle cx={cursor} cy={y(reading)} r="2.5" className="tonga-chart-dot" data-ramp="" />
          </>
        )}
      </svg>
      <div className="tonga-chart-meta">
        <time dateTime={timeIso(station.start)}>{timeLabel(station.start)}</time>
        <span>
          {low}–{high} hPa
        </span>
        <time dateTime={timeIso(end)}>{timeLabel(end)} UTC</time>
      </div>
    </div>
  );
}
