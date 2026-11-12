import { mapLayerNames, type MapLayer, type MapLayers } from "./layerVisibility";

export const playbackLayers = ["radar", "wind", "lightning"] as const;
export type LayerTimes = Record<(typeof playbackLayers)[number], number | null>;
export const latestLayerTimes: LayerTimes = { radar: null, wind: null, lightning: null };
export interface SharedLayers {
  layers?: MapLayers;
  layerTimes?: LayerTimes;
}

export function writeLayers(params: URLSearchParams, state: SharedLayers): void {
  if (state.layers)
    params.set(
      "layers",
      (Object.keys(mapLayerNames) as MapLayer[]).filter((id) => state.layers![id]).join(","),
    );
  for (const id of playbackLayers) {
    const at = state.layerTimes?.[id];
    if (at !== null && at !== undefined) params.set(`${id}At`, String(Math.round(at / 1000)));
  }
}

export function readLayers(params: URLSearchParams): SharedLayers {
  const result: SharedLayers = {};
  const value = params.get("layers");
  const keys = Object.keys(mapLayerNames) as MapLayer[];
  if (value !== null) {
    const chosen = value.split(",");
    // An empty choice is intentional; an unrecognized value must not hide the whole scene.
    if (value === "" || keys.some((id) => chosen.includes(id)))
      result.layers = Object.fromEntries(keys.map((id) => [id, chosen.includes(id)])) as MapLayers;
  }
  for (const id of playbackLayers) {
    const raw = params.get(`${id}At`);
    const at = Number(raw) * 1000;
    if (raw?.trim() && Number.isFinite(at) && at >= 0 && at <= 4_102_444_800_000) {
      result.layerTimes ??= { ...latestLayerTimes };
      result.layerTimes[id] = at;
    }
  }
  return result;
}
