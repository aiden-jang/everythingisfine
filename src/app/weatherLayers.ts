import type { FeedRow } from "./feedStatus";
import type { ObservationData, ObservationFrame, ObservationView } from "./observations/types";
import type { RadarLayerView } from "./radar/radarCamera";
import { nearest } from "../sources/observations/common";

export const weatherLayers = {
  wind: {
    label: "Surface wind",
    source: "NOAA GFS surface wind",
    coverage: "Global forecast · 10 m above surface",
  },
  lightning: {
    label: "Lightning",
    source: "NOAA GOES-East lightning",
    coverage: "Satellite detections · GOES-East coverage",
  },
} as const;
export type WeatherLayerId = keyof typeof weatherLayers;
export type PlaybackLayer = WeatherLayerId | "radar";
export interface WeatherLayerView {
  frame: ObservationFrame | undefined;
  feed: Pick<FeedRow, "state" | "lastCheck" | "message">;
}
export interface MapLayerPresentation {
  kind: "map-layers";
  radar: RadarLayerView | null;
  observation: ObservationView | null;
}

const target = { lon: 0, lat: 0, zoom: 1 };
export function weatherOverlay(
  wind?: ObservationFrame,
  lightning?: ObservationFrame,
): ObservationView | null {
  if (!wind && !lightning) return null;
  return {
    kind: "observation",
    target,
    image: null,
    frame: {
      at: wind?.at ?? lightning!.at,
      ...(wind?.paths ? { paths: wind.paths, flow: wind.flow ?? false } : {}),
      ...(lightning?.marks ? { marks: lightning.marks } : {}),
    },
  };
}

export function weatherFrame(
  data: ObservationData | null,
  id: WeatherLayerId,
  selectedAt: number | null,
  now: number,
) {
  const frames = data?.frames ?? [];
  return selectedAt === null && id === "lightning"
    ? frames.at(-1)
    : nearest(frames, selectedAt ?? now, ({ at }) => at);
}

export function weatherFeed(
  id: WeatherLayerId,
  state: "loading" | "ready" | "empty" | "failed",
  lastCheck: number | undefined,
  latestAt?: number,
): WeatherLayerView["feed"] {
  const delayed =
    lastCheck !== undefined &&
    latestAt !== undefined &&
    lastCheck - latestAt > (id === "lightning" ? 15 * 60_000 : 0);
  return {
    state: state === "loading" ? "pending" : state === "failed" ? "failed" : "ok",
    lastCheck,
    message:
      state === "empty"
        ? "Available · no recent data"
        : state === "ready" && delayed
          ? "Available · data delayed"
          : undefined,
  };
}
