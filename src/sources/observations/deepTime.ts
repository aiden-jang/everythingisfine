import {
  ObservationDataError,
  type GeoPoint,
  type ObservationPath,
  type ObservationSource,
} from "../../app/observations/types";
import { request } from "./common";
import recordingUrl from "./recordings/deep-time.json?url";

interface Reconstruction {
  age: number;
  outlines: number[][];
  points: [number, number][];
}

const places = ["Rio de Janeiro", "Accra", "New York"] as const;
const target = { lon: -24, lat: -1, zoom: 1.04 };
const coordinates = ([lon, lat]: readonly [number, number]) => ({ lon, lat });
const GPLATES = "https://gws.gplates.org/reconstruct";
const MODEL = "MULLER2019";

async function customPin(option: string, signal: AbortSignal): Promise<readonly GeoPoint[]> {
  const [lon, lat] = option.slice("pin:".length).split(",").map(Number);
  const params = new URLSearchParams({
    model: MODEL,
    lons: String(lon),
    lats: String(lat),
    with_valid_time: "1",
  });
  const assignment = await request(`${GPLATES}/assign_points_plate_ids?${params}`, signal);
  const plates = (await assignment.json()) as {
    pid?: number;
    valid_time?: readonly [number, number | string];
  }[];
  const plate = plates[0];
  if (!plate?.pid || !plate.valid_time || !Number.isFinite(plate.valid_time[0]))
    throw new ObservationDataError("This coordinate is outside the model’s present-day plates.");
  const limit = Math.max(0, Math.min(230, Math.floor(plate.valid_time[0] / 10) * 10));
  if (limit === 0) return [{ lon: lon!, lat: lat! }];
  const query = new URLSearchParams({
    model: MODEL,
    seedpoints: `${lon},${lat}`,
    movplate: String(plate.pid),
    timespec: `0,${limit},10`,
  });
  const result = await request(`${GPLATES}/motion_path/?${query}`, signal);
  const path = (await result.json()) as { features?: { geometry?: { coordinates?: [number, number][] } }[] };
  const track = path.features?.[0]?.geometry?.coordinates;
  if (track?.length !== limit / 10 + 1 || track.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))
    throw new ObservationDataError("GPlates couldn’t reconstruct that point across its available ages.");
  return track.slice().reverse().map(coordinates);
}
const pin = (frames: readonly Reconstruction[], option: string) => {
  const index = places.findIndex((name) => name === option);
  return index < 0 ? [] : frames.map(({ points }) => coordinates(points[index]!));
};

export const deepTime: ObservationSource = {
  options: [{ id: "", label: "No place pinned" }, ...places.map((name) => ({ id: name, label: name }))],
  async load(option, signal) {
    const custom = option.startsWith("pin:");
    const [samples, customTrack] = await Promise.all([
      request(recordingUrl, signal).then(async (response) => (await response.json()) as Reconstruction[]),
      custom ? customPin(option, signal) : undefined,
    ]);
    const track = customTrack ?? pin(samples, option);
    const label = custom ? "Pinned point" : `${option}’s plate position`;
    return {
      target,
      mapTarget: { ...target, zoom: 0.76 },
      frames: samples.map(({ age, outlines }, index) => {
        const point = track[index];
        const paths: ObservationPath[] = outlines.map((outline) => ({
          points: Array.from({ length: outline.length / 2 }, (_, i) => ({
            lon: outline[2 * i]! / 100,
            lat: outline[2 * i + 1]! / 100,
            lift: 0.006,
          })),
          color: 0x86cfc8,
        }));
        if (point) paths.push({ points: track.slice(0, index + 1), color: 0xe5ba8d });
        return {
          at: index,
          timeLabel: age === 0 ? "Present day" : `${age} million years ago`,
          reconstruction: true,
          paths,
          marks: point ? [{ ...point, color: 0xf1c590, size: 19 }] : [],
          measurements: point
            ? [
                {
                  label,
                  value: `${point.lat.toFixed(1)}°, ${point.lon.toFixed(1)}°`,
                },
              ]
            : custom
              ? [{ label, value: "Older than this plate’s available track" }]
              : [],
        };
      }),
      chapters: [
        { index: 0, label: "Present day" },
        { index: 10, label: "100 million years ago" },
        { index: 23, label: "Pangaea · 230 million years ago" },
      ],
      note: "Müller et al. (2019), via EarthByte / GPlates. Outlines show modeled continental positions at 10-million-year steps. Place names identify present-day points on the plates.",
    };
  },
};
