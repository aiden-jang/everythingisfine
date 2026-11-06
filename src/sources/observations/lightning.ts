import { File } from "jsfive";
import type { ObservationFrame, ObservationMark, ObservationSource } from "../../app/observations/types";
import { HOUR, MINUTE, nearest, request, utc } from "./common";

const S3 = "https://noaa-goes19.s3.amazonaws.com";
const LABEL = "Satellite detections";
const WINDOW = 36 * MINUTE;

function scanTime(key: string) {
  const time = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d/.exec(key);
  if (!time) return NaN;
  const [, year, day, hour, minute, second] = time;
  return Date.UTC(Number(year), 0, Number(day), Number(hour), Number(minute), Number(second));
}

function prefix(at: number) {
  const date = new Date(at);
  const year = date.getUTCFullYear();
  const day = Math.floor((at - Date.UTC(year, 0, 1)) / (24 * HOUR)) + 1;
  return `GLM-L2-LCFA/${year}/${String(day).padStart(3, "0")}/${utc(at).slice(11, 13)}/`;
}

async function catalogue(at: number, signal: AbortSignal) {
  const params = new URLSearchParams({ "list-type": "2", "max-keys": "200", prefix: prefix(at) });
  const xml = await (await request(`${S3}/?${params}`, signal)).text();
  return [...xml.matchAll(/<Key>(GLM-L2-LCFA\/[\w/.-]+\.nc)<\/Key>/g)].flatMap((match) => {
    const key = match[1]!;
    const time = scanTime(key);
    return Number.isFinite(time) ? [{ key, at: time }] : [];
  });
}

async function flashes(scan: { key: string; at: number }, signal: AbortSignal): Promise<ObservationFrame> {
  const response = await request(`${S3}/${scan.key}`, signal);
  const file = new File(await response.arrayBuffer());
  const field = (name: string): number[] | null => {
    const value = file.get(name).value;
    return Array.isArray(value) && value.every((entry) => typeof entry === "number") ? value : null;
  };
  const lats = field("flash_lat");
  const lons = field("flash_lon");
  const quality = field("flash_quality_flag");
  if (!lats || !lons || !quality || lats.length !== lons.length || lats.length !== quality.length)
    throw new Error("Unrecognized NOAA GLM scan");
  const marks: ObservationMark[] = [];
  for (let i = 0; i < lats.length; i++) {
    const lat = lats[i]!;
    const lon = lons[i]!;
    if (
      quality[i] !== 0 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 55 ||
      Math.abs(lon) > 180
    )
      continue;
    marks.push({ lon, lat, color: 0xf5d59d, size: 13 });
  }
  return {
    at: scan.at,
    marks: marks.filter((_, index) => index % Math.ceil(Math.max(1, marks.length / 700)) === 0),
    measurements: [{ label: LABEL, value: marks.length.toLocaleString() }],
  };
}

export async function radarLightning(at: number, signal: AbortSignal) {
  const scans = await catalogue(at, signal);
  const scan = nearest(scans, at, (item) => item.at);
  if (!scan || Math.abs(scan.at - at) > MINUTE) return null;
  return flashes(scan, signal);
}

export const lightning: ObservationSource = {
  refreshMs: 5 * MINUTE,
  async load(_option, signal) {
    const now = Date.now();
    const result = await Promise.allSettled([catalogue(now - HOUR, signal), catalogue(now, signal)]);
    const recent = result
      .flatMap((value) => (value.status === "fulfilled" ? value.value : []))
      .filter(({ at }) => at <= now && at >= now - WINDOW)
      .sort((a, b) => a.at - b.at);
    if (!recent.length && result.every(({ status }) => status === "rejected"))
      throw new Error("GOES catalogue unavailable");
    const selected: typeof recent = [];
    for (let at = now - 30 * MINUTE; at <= now; at += 5 * MINUTE) {
      const scan = nearest(recent, at, (item) => item.at);
      if (scan && Math.abs(scan.at - at) < 2.5 * MINUTE && !selected.includes(scan)) selected.push(scan);
    }
    const batches = await Promise.allSettled(selected.map((scan) => flashes(scan, signal)));
    const frames = batches.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    if (selected.length && !frames.length) throw new Error("GOES scans unavailable");
    return {
      target: { lon: -78, lat: 14, zoom: 1.35 },
      frames,
      note: "GOES-East optical flash centroids. Each step shows a selected 20-second scan. Dots represent detected flashes in GOES-East coverage.",
    };
  },
};
