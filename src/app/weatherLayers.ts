import type { FeedRow } from "./feedStatus";
import type { ObservationData, ObservationFrame, ObservationView } from "./observations/types";
import type { RadarLayerView } from "./radar/radarCamera";
import type { GlobePresentation } from "../globe/scenePresentation";
import { nearest } from "../sources/observations/common";
import { layerMetadata } from "./layerMetadata";
import { mapLayerNames } from "./layerVisibility";

export const weatherLayers = {
  wind: {
    label: mapLayerNames.wind,
    source: "NOAA GFS surface wind",
    coverage: layerMetadata.wind.coverage,
  },
  lightning: {
    label: mapLayerNames.lightning,
    source: "NOAA GOES-East lightning",
    coverage: layerMetadata.lightning.coverage,
  },
} as const;
export type WeatherLayerId = keyof typeof weatherLayers;
export type PlaybackLayer = WeatherLayerId | "radar";
export interface WeatherLayerView {
  frame: ObservationFrame | undefined;
  feed: Pick<FeedRow, "state" | "lastCheck" | "message">;
  lastAvailable?: boolean;
}
export interface MapLayerPresentation {
  kind: "map-layers";
  base?: "landing" | "dayline";
  radar: RadarLayerView | null;
  observation: ObservationView | null;
}

export function composeMapLayers(layers: MapLayerPresentation | null) {
  const landing: GlobePresentation = layers ? { ...layers, base: "landing" } : "landing";
  const dayline: GlobePresentation = layers ? { ...layers, base: "dayline" } : "dayline";
  return (mode: GlobePresentation): GlobePresentation =>
    mode === "landing" ? landing : mode === "dayline" ? dayline : (mode ?? layers);
}

export function isLandingPresentation(mode: GlobePresentation): boolean {
  return (
    mode === "landing" ||
    (mode !== null &&
      typeof mode === "object" &&
      "kind" in mode &&
      mode.kind === "map-layers" &&
      mode.base === "landing")
  );
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
      pathOpacity: 0.48,
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
