import type { ObservationPath, ObservationSource } from "../../app/observations/types";
import { swellBuoys as buoys } from "../../app/observations/swellBuoys";
import { DEG } from "../../geo/sphere";
import { HOUR, nearest, request } from "./common";

const MARINE = "https://marine-api.open-meteo.com/v1/marine";
const CDIP = "https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json";
const grid = [16, 23, 30, 37, 44, 51].flatMap((lat) =>
  [152, 164, 176, -172, -160, -148, -136, -126].map((lon) => ({ lat, lon })),
);
const locations = [...grid, ...buoys];
const wrap = (lon: number) => ((lon + 540) % 360) - 180;
type Value = number | null;
interface WavePoint {
  latitude: number;
  longitude: number;
  hourly: {
    time: number[];
    swell_wave_height: Value[];
    swell_wave_direction: Value[];
    wave_height: Value[];
    wave_period: Value[];
  };
}
type BuoyRow = [time: string, lat: number, lon: number, height: Value, period: Value];

let recent: { checked: number; points: WavePoint[] } | undefined;
async function forecast(signal: AbortSignal) {
  if (recent && Date.now() - recent.checked < HOUR) return recent.points;
  const params = new URLSearchParams({
    latitude: locations.map(({ lat }) => lat).join(","),
    longitude: locations.map(({ lon }) => lon).join(","),
    hourly: "swell_wave_height,swell_wave_direction,wave_height,wave_period",
    models: "ncep_gfswave025",
    forecast_hours: "48",
    past_hours: "12",
    cell_selection: "sea",
    timeformat: "unixtime",
  });
  const points = (await (await request(`${MARINE}?${params}`, signal)).json()) as WavePoint[];
  if (!Array.isArray(points) || points.length !== locations.length || !points[0]?.hourly?.time.length)
    throw new Error("Incomplete NOAA GFS-Wave forecast.");
  recent = { checked: Date.now(), points };
  return points;
}

async function observations(id: string, signal: AbortSignal): Promise<BuoyRow | undefined> {
  const query = `time,latitude,longitude,waveHs,waveTp&station_id=%22${id}%22&time%3E=now-12hours&waveFlagPrimary=1&orderByMax(%22time%22)`;
  const response = (await (await request(`${CDIP}?${query}`, signal)).json()) as {
    table?: { rows?: BuoyRow[] };
  };
  return response.table?.rows?.find(
    ([at, lat, lon, height, period]) =>
      Number.isFinite(Date.parse(at)) &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      valid(height) &&
      valid(period),
  );
}
const valid = (value: Value | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const heightLabel = (value: Value | undefined) => (valid(value) ? `${value.toFixed(1)} m` : "Unavailable");
const periodLabel = (value: Value | undefined) => (valid(value) ? `${value.toFixed(1)} s` : "Unavailable");

function crest(lat: number, lon: number, direction: number, height: number): ObservationPath {
  const bearing = (direction + 180) * DEG;
  const length = 0.38 + Math.min(2.4, height * 0.35);
  return {
    color: height >= 4 ? 0xe7bb84 : height >= 2 ? 0x87ddd5 : 0x6396b0,
    points: Array.from({ length: 5 }, (_, index) => {
      const step = ((index - 2) / 2) * length;
      return {
        lat: lat + Math.cos(bearing) * step,
        lon: wrap(lon + (Math.sin(bearing) * step) / Math.cos(lat * DEG)),
        lift: 0.006,
      };
    }),
  };
}

export const swell: ObservationSource = {
  options: buoys,
  refreshMs: HOUR,
  async load(id, signal) {
    const buoyIndex = Math.max(
      0,
      buoys.findIndex((station) => station.id === id),
    );
    const buoy = buoys[buoyIndex]!;
    const [points, observed] = await Promise.all([
      forecast(signal),
      observations(buoy.id, AbortSignal.any([signal, AbortSignal.timeout(5000)])).catch(() => undefined),
    ]);
    const model = points[grid.length + buoyIndex]!.hourly;
    const measuredAt = observed ? Date.parse(observed[0]) : NaN;
    const matchedTime = observed ? nearest(model.time, measuredAt / 1000, (at) => at) : undefined;
    const match =
      matchedTime !== undefined && Math.abs(matchedTime * 1000 - measuredAt) <= HOUR
        ? model.time.indexOf(matchedTime)
        : -1;
    const earliest = Math.floor(Date.now() / HOUR) * HOUR;
    const frames = model.time.flatMap((unix, index) => {
      if (unix * 1000 < earliest || (unix * 1000 - earliest) % (3 * HOUR) !== 0) return [];
      const paths = points.slice(0, grid.length).flatMap(({ latitude, longitude, hourly }) => {
        const direction = hourly.swell_wave_direction[index];
        const height = hourly.swell_wave_height[index];
        return valid(direction) && valid(height) && height > 0.15
          ? [crest(latitude, longitude, direction, height)]
          : [];
      });
      if (!paths.length) return [];
      return [
        {
          at: unix * 1000,
          paths,
          flow: true,
          marks: [{ lat: observed?.[1] ?? buoy.lat, lon: observed?.[2] ?? buoy.lon, size: 18 }],
          measurements: [
            { label: "Forecast wave height near buoy", value: heightLabel(model.wave_height[index]) },
            { label: "Forecast wave period", value: periodLabel(model.wave_period[index]) },
            { label: "Latest measured wave height", value: heightLabel(observed?.[3]) },
            { label: "Latest measured peak period", value: periodLabel(observed?.[4]) },
          ],
          details: {
            title: "Compare height near the observation time",
            rows: [
              {
                label: "CDIP buoy observation",
                value: observed ? observed[0].replace("T", " ").replace("Z", " UTC") : "Unavailable",
              },
              {
                label: "Nearby model height at that hour",
                value: match < 0 ? "Unavailable" : heightLabel(model.wave_height[match]),
              },
            ],
          },
        },
      ];
    });
    return {
      frames,
      target: { lon: -155, lat: 29, zoom: 1.29 },
      mapTarget: { lon: -158, lat: 24, zoom: 1.2 },
      note: "NOAA NCEP GFS-Wave via Open-Meteo (CC BY 4.0), sampled over the Pacific. Moving strokes show modeled swell direction and height. The Scripps CDIP buoy reports peak period, which can differ from the model’s wave period.",
    };
  },
};
