import type { HazardInput } from "./hazards";
import { withinWindow } from "./age";

export function hazardsInWindow(
  data: HazardInput,
  now: number,
  windowMs: number,
  revealAt: number | null,
): HazardInput {
  const shown = <T>(list: readonly T[], dateOf: (h: T) => number | null): readonly T[] =>
    list.filter((h) => {
      const at = dateOf(h);
      return withinWindow(at, now, windowMs) && (revealAt === null || at === null || at <= revealAt);
    });
  const started = (h: { startedAt: number | null }) => h.startedAt;
  return {
    cyclones: shown(data.cyclones, started),
    volcanoes: shown(data.volcanoes, (v) => v.endedAt),
    fires: shown(data.fires, started),
    floods: shown(data.floods, started),
  };
}

export const mapLayerNames = {
  earthquakes: "Earthquakes",
  cyclones: "Tropical cyclones",
  fires: "Wildfires",
  floods: "Floods",
  volcanoes: "Volcanoes",
  aurora: "Aurora forecast",
  radar: "Storm radar",
} as const;
export type MapLayer = keyof typeof mapLayerNames;
export type MapLayers = Record<MapLayer, boolean>;
export const defaultMapLayers: MapLayers = {
  earthquakes: true,
  cyclones: true,
  fires: true,
  floods: true,
  volcanoes: true,
  aurora: true,
  radar: true,
};

export function readMapLayers(raw: string | null, target?: string): MapLayers {
  let saved: unknown;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const layers = { ...defaultMapLayers };
  for (const key of Object.keys(layers) as MapLayer[]) {
    const value = saved && typeof saved === "object" ? (saved as Record<string, unknown>)[key] : undefined;
    if (typeof value === "boolean") layers[key] = value;
  }
  // A shared event must stay visible even when this device previously hid its layer.
  const kind = target?.split(":")[0];
  const layer = {
    quake: "earthquakes",
    cyclone: "cyclones",
    fire: "fires",
    flood: "floods",
    volcano: "volcanoes",
  }[kind ?? ""];
  if (layer) layers[layer as MapLayer] = true;
  return layers;
}

export function visibleHazards<T>(
  data: HazardInput & { aurora: T | null },
  layers: MapLayers,
): HazardInput & { aurora: T | null } {
  return {
    ...data,
    cyclones: layers.cyclones ? data.cyclones : [],
    fires: layers.fires ? data.fires : [],
    floods: layers.floods ? data.floods : [],
    volcanoes: layers.volcanoes ? data.volcanoes : [],
    aurora: layers.aurora ? data.aurora : null,
  };
}

export function markBelongsToLayer(mark: string | null, layer: MapLayer): boolean {
  const kind = {
    cyclones: "cyclone",
    fires: "fire",
    floods: "flood",
    volcanoes: "volcano",
    earthquakes: "quake",
    aurora: "aurora",
    radar: "radar",
  }[layer];
  return mark?.startsWith(`${kind}:`) ?? false;
}
