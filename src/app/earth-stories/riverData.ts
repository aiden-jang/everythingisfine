import { NetCDFReader, type Attribute } from "netcdfjs";
import type { ObservationPath } from "../observations/types";
import type { EarthStoryData } from "./types";
import recorded from "../../sources/earth-atlas/river.nc?url";

const HOUR = 3600000;
const variables = [
  "Specific_humidity_isobaric",
  "u-component_of_wind_isobaric",
  "v-component_of_wind_isobaric",
  "Pressure_surface",
  "Precipitation_rate_surface",
];

export function columnTransport(
  pressure: readonly number[],
  surface: number,
  east: readonly number[],
  north: readonly number[],
  humidity: readonly number[],
) {
  let u = 0,
    v = 0,
    used = 0;
  if (!Number.isFinite(surface)) return null;
  const bottom = Math.min(100000, surface);
  for (let k = 1; k < pressure.length; k++) {
    const a = Math.max(30000, pressure[k - 1]!);
    const b = Math.min(bottom, pressure[k]!);
    if (b <= a) continue;
    const q0 = humidity[k - 1]!,
      q1 = humidity[k]!;
    if (
      ![q0, q1, east[k - 1], east[k], north[k - 1], north[k]].every(Number.isFinite) ||
      q0 < 0 ||
      q1 < 0 ||
      q0 > 0.1 ||
      q1 > 0.1
    )
      return null;
    const fraction = (p: number) => (p - pressure[k - 1]!) / (pressure[k]! - pressure[k - 1]!);
    const flux = (wind: readonly number[], p: number) => {
      const t = fraction(p);
      return q0 * wind[k - 1]! * (1 - t) + q1 * wind[k]! * t;
    };
    u += ((flux(east, a) + flux(east, b)) * (b - a)) / (2 * 9.80665);
    v += ((flux(north, a) + flux(north, b)) * (b - a)) / (2 * 9.80665);
    used += b - a;
  }
  return used > 0 && Math.abs(used - (bottom - 30000)) < 1 ? { u, v, magnitude: Math.hypot(u, v) } : null;
}

export function parseRiver(buffer: ArrayBuffer, archive: boolean): EarthStoryData {
  const grid = new NetCDFReader(buffer);
  const read = (name: string) => grid.getDataVariable(name).map(Number);
  const attributes: readonly Attribute[] = grid.variables.find((v) => v.name === "time")?.attributes ?? [];
  const units = attributes.find((a) => a.name === "units")?.value;
  const origin = typeof units === "string" ? Date.parse(/^hours? since (.+)$/i.exec(units)?.[1] ?? "") : NaN;
  const [q, u, v, surface, rain] = variables.map(read);
  const pressure = read("isobaric"),
    lons = read("longitude"),
    lats = read("latitude"),
    times = read("time"),
    runs = read("reftime");
  if (
    !Number.isFinite(origin) ||
    times.length < 2 ||
    lons.length < 10 ||
    lats.length < 10 ||
    pressure.length < 10
  )
    throw new Error("Incomplete water-vapor forecast");
  const area = lons.length * lats.length;
  const frames = times.map((hour, index) => {
    const paths: ObservationPath[] = [];
    let maximum = 0,
      coastalRain: number | null = null;
    for (let row = 0; row < lats.length; row++)
      for (let col = 0; col < lons.length; col++) {
        const i = row * lons.length + col,
          lon = ((lons[col]! + 540) % 360) - 180,
          lat = lats[row]!;
        const profile = (field: number[]) =>
          pressure.map((_, level) => field[(index * pressure.length + level) * area + i]!);
        const transport = columnTransport(
          pressure,
          surface![index * area + i]!,
          profile(u!),
          profile(v!),
          profile(q!),
        );
        const rainfall = rain![index * area + i]! * 3600;
        if (
          lon > -128 &&
          lon < -115 &&
          lat > 30 &&
          lat < 50 &&
          Number.isFinite(rainfall) &&
          rainfall >= 0 &&
          rainfall < 1000
        )
          coastalRain = Math.max(coastalRain ?? 0, rainfall);
        if (!transport || transport.magnitude < 80) continue;
        maximum = Math.max(maximum, transport.magnitude);
        const scale = Math.min(0.006, 6 / transport.magnitude);
        paths.push({
          color: transport.magnitude >= 500 ? 0xf4ca8d : transport.magnitude >= 250 ? 0x8bdbcb : 0x527f9b,
          points: Array.from({ length: 9 }, (_, k) => ({
            lon: lon + (transport.u * scale * k) / (8 * Math.cos((lat * Math.PI) / 180)),
            lat: lat + (transport.v * scale * k) / 8,
            lift: 0.008,
          })),
        });
      }
    return {
      at: origin + hour * HOUR,
      caption: `${archive ? "Recorded" : "Current"} GFS forecast · water-vapor transport`,
      paths,
      flow: true,
      measurements: [
        { label: "Strongest sampled transport", value: `${Math.round(maximum)} kg m⁻¹ s⁻¹` },
        {
          label: "Strongest coastal grid-cell rain",
          value: coastalRain === null ? "No forecast value" : `${coastalRain.toFixed(1)} mm/h · forecast`,
        },
        {
          label: "Model run",
          value: new Date(origin + runs[index]! * HOUR).toISOString().slice(0, 16).replace("T", " ") + " UTC",
        },
      ],
    };
  });
  if (!frames.some((f) => f.paths.length)) throw new Error("No valid transport columns");
  return {
    frames,
    target: { lon: -143, lat: 38, zoom: 1.3 },
    chapters: [
      { at: frames[0]!.at, label: "Pacific" },
      { at: frames[2]!.at, label: "Approaching the coast" },
      { at: frames.at(-1)!.at, label: "Forecast end" },
    ],
    legend: [
      { color: "#527f9b", label: "80–249 kg m⁻¹ s⁻¹" },
      { color: "#8bdbcb", label: "250–499" },
      { color: "#f4ca8d", label: "500+" },
    ],
  };
}

export async function riverStory(choice: string): Promise<EarthStoryData> {
  const archive = choice !== "Latest forecast";
  const response = await fetch(archive ? recorded : "/api/observations/river", {
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("Forecast unavailable");
  return parseRiver(await response.arrayBuffer(), archive);
}
