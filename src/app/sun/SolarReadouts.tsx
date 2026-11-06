import {
  SPACE_WEATHER_FRESHNESS,
  WIND_WINDOW,
  XRAY_WINDOW,
  type SpaceSample,
  type WindSample,
} from "../../sources/spaceWeather";
import type { Readings } from "./useSpaceWeather";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hourCycle: "h23",
});
const asTime = (at: number) => new Date(at).toISOString().slice(11, 16);
const signed = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function readingStatus(data: Readings<SpaceSample>): string {
  const sample = data.points.at(-1);
  if (!sample) {
    if (data.status === "waiting") return "Waiting for NOAA";
    return data.status === "empty" ? "No recent readings" : "NOAA feed unavailable";
  }
  if (data.status === "error") return "Update failed · last reading";
  if (data.status !== "ok") return "No new readings · last reading";
  const age = Math.round((data.now - sample.at) / 60_000);
  if (data.now - sample.at <= SPACE_WEATHER_FRESHNESS) return "Current reading";
  return age >= 120
    ? `Latest reading is ${Math.round(age / 60)} hours old`
    : `Latest reading is ${age} minutes old`;
}

function Chart({ data, wind }: { data: Readings<SpaceSample>; wind: boolean }): JSX.Element {
  const window = wind ? WIND_WINDOW : XRAY_WINDOW;
  const latest = data.points.at(-1);
  const to = Math.max(data.now, latest?.at ?? 0);
  const from = to - window;
  const points = data.points.filter(({ at }) => at >= from);
  const values = points.map(({ value }) => (wind ? value : Math.log10(value)));
  const unit = wind ? "km/s" : "W/m²";
  const low = wind
    ? Math.max(0, Math.floor(Math.min(...values) / 25) * 25 - 25)
    : Math.min(-8, Math.floor(Math.min(...values)));
  const high = wind
    ? Math.ceil(Math.max(...values) / 25) * 25 + 25
    : Math.max(-4, Math.ceil(Math.max(...values)));
  const width = 240;
  const height = 42;
  const x = (at: number) => ((at - from) * (width - 4)) / window + 2;
  const y = (value: number) => 3 + (1 - (value - low) / (high - low)) * (height - 6);
  const path = points
    .map(({ at, source }, i) => {
      const previous = points[i - 1];
      const command = previous && at - previous.at <= 180_000 && source === previous.source ? "L" : "M";
      return command + x(at).toFixed(1) + " " + y(values[i]!).toFixed(1);
    })
    .join(" ");
  return (
    <div className="sun-chart" data-series={wind ? "wind" : "xray"}>
      {points.length ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={
            wind
              ? `Solar wind speed over the last hour, from ${low} to ${high} ${unit}`
              : "GOES X-ray flux over six hours, on a logarithmic scale"
          }
        >
          <path className="sun-chart-grid" d="M0 3h240 M0 21h240 M0 39h240" />
          <path className="sun-chart-line" d={path} />
          <circle cx={x(latest!.at)} cy={y(values.at(-1)!)} r="2" />
        </svg>
      ) : (
        <div className="sun-chart-empty">No points in this window</div>
      )}
      <div className="sun-chart-times" aria-hidden="true">
        <span>{asTime(from)}</span>
        <span>{asTime(to)} UTC</span>
      </div>
    </div>
  );
}

function Stamp({ data }: { data: Readings<SpaceSample> }): JSX.Element {
  const point = data.points.at(-1);
  return (
    <p className="sun-stamp">
      <span>{readingStatus(data)}</span>
      {point && (
        <>
          <span aria-hidden="true"> · </span>
          <time
            dateTime={new Date(point.at).toISOString()}
            aria-label={dateFormat.format(point.at) + " UTC"}
            title={dateFormat.format(point.at) + " UTC"}
          >
            {asTime(point.at)} UTC
          </time>
        </>
      )}
    </p>
  );
}

export function SolarReadouts({
  wind,
  xray,
}: {
  wind: Readings<WindSample>;
  xray: Readings<SpaceSample>;
}): JSX.Element {
  const sample = wind.points.at(-1);
  const radiation = xray.points.at(-1);
  return (
    <div className="sun-readings" aria-label="Independent NOAA observation windows">
      <section aria-label="Solar wind measurements">
        <div className="sun-reading-heading">
          <h3>Solar wind</h3>
          <span>1 hour</span>
        </div>
        <p className="sun-value">
          {sample ? (
            <>
              <strong>{signed.format(sample.value)}</strong> km/s
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="sun-instrument">
          {sample ? (
            <>
              {sample.source}
              {sample.density !== null && ` · ${signed.format(sample.density)} p/cm³`}
            </>
          ) : (
            "Upstream spacecraft"
          )}
        </p>
        <Chart data={wind} wind />
        <Stamp data={wind} />
      </section>
      <section aria-label="GOES X-ray measurements">
        <div className="sun-reading-heading">
          <h3>GOES X-rays</h3>
          <span>6 hours</span>
        </div>
        <p className="sun-value">
          {radiation ? (
            <>
              <strong>{radiation.value.toExponential(2)}</strong> W/m²
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="sun-instrument">{radiation ? `${radiation.source} · 0.1–0.8 nm` : "0.1–0.8 nm band"}</p>
        <Chart data={xray} wind={false} />
        <Stamp data={xray} />
      </section>
    </div>
  );
}
