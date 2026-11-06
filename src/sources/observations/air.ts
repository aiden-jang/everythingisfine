import type { ObservationSource } from "../../app/observations/types";
import { HOUR, request, utc } from "./common";
import stations from "./air-sites.json";

const AIRNOW = "https://files.airnowtech.org/airnow";
const cities = Object.entries(stations);

function file(at: number) {
  const [day, time] = utc(at).split("T");
  const digits = day!.replaceAll("-", "");
  return `${AIRNOW}/${digits.slice(0, 4)}/${digits}/HourlyData_${digits}${time!.slice(0, 2)}.dat`;
}

type City = { lat: number; lon: number; sites: Record<string, readonly (string | number)[]> };

function airFrame(input: string, at: number, city: City) {
  const rows = new Map<string, { lat: number; lon: number; value: number; label: string }>();
  for (const line of input.split("\n")) {
    const parts = line.split("|");
    const id = parts[2];
    if (!id || parts[5] !== "PM2.5" || parts[6] !== "UG/M3" || !parts[7]?.trim()) continue;
    const coords = city.sites[id];
    const value = Number(parts[7]);
    if (!coords || !Number.isFinite(value)) continue;
    rows.set(id, { lat: Number(coords[0]), lon: Number(coords[1]), label: String(coords[2]), value });
  }
  const readings = [...rows.values()].sort((a, b) => b.value - a.value);
  const highest = readings[0];
  return {
    at,
    details: {
      title: "Monitor readings",
      rows: readings.map(({ label, value }) => ({ label, value: `${value.toFixed(1)} µg/m³` })),
    },
    marks: readings.map((point) => ({
      ...point,
      size: 8 + Math.min(21, Math.sqrt(Math.max(0, point.value)) * 2),
      color: point.value > 35 ? 0xefb88d : point.value > 12 ? 0xd9d49b : 0x8ad4cc,
    })),
    measurements: [
      { label: "Monitors reporting", value: String(readings.length) },
      {
        label: "Highest PM₂.₅ reading",
        value: highest ? `${highest.value.toFixed(1)} µg/m³` : "No readings",
      },
      ...(highest ? [{ label: "Monitor", value: highest.label }] : []),
    ],
  };
}

export const air: ObservationSource = {
  options: cities.map(([name]) => ({ id: name, label: name })),
  refreshMs: 30 * 60_000,
  async load(option, signal) {
    const city = cities.find(([name]) => name === option)?.[1] ?? cities[0]![1];
    const latest = Math.floor((Date.now() - HOUR) / HOUR) * HOUR;
    const window = Array.from({ length: 5 }, (_, index) => latest - (4 - index) * HOUR);
    const responses = await Promise.allSettled(
      window.map(async (at) => {
        const response = await request(file(at), signal);
        return airFrame(await response.text(), at, city);
      }),
    );
    const frames = responses.flatMap((response) => (response.status === "fulfilled" ? [response.value] : []));
    if (!frames.length) throw new Error("No hourly files reached");
    return {
      target: { lon: city.lon, lat: city.lat, zoom: 2.7 },
      frames,
      initial: frames.length - 1,
      note: "Preliminary hourly particle concentrations at EPA AirNow monitors. Circle size scales with concentration. Small or empty gaps reflect monitor coverage.",
    };
  },
};
