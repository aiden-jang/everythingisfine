import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Filters } from "../data/types";
import { stored, store } from "./stored";
import { readMapLayers, type MapLayer } from "./layerVisibility";
import type { RadarLayerView, RadarView } from "./radar/radarCamera";
import type { FeedRow } from "./feedStatus";
import {
  weatherLayers,
  weatherOverlay,
  composeMapLayers,
  type WeatherLayerId,
  type WeatherLayerView,
  type PlaybackLayer,
  type MapLayerPresentation,
} from "./weatherLayers";

export function useMapLayers(filters: Filters, background: boolean, target?: string, archived = false) {
  const [enabled, setEnabled] = useState(() => readMapLayers(stored("mapLayers"), target));
  const [radarView, updateRadar] = useState<RadarView | null>(null);
  const [weather, setWeather] = useState<Partial<Record<WeatherLayerId, WeatherLayerView>>>({});
  const [expanded, expand] = useState<PlaybackLayer | null>("radar");
  const [selectedTimes, setSelectedTimes] = useState<Record<PlaybackLayer, number | null>>({
    radar: null,
    wind: null,
    lightning: null,
  });
  const selectTime = useCallback((id: PlaybackLayer, at: number | null) => {
    setSelectedTimes((previous) => ({ ...previous, [id]: at }));
  }, []);
  const active = background && !archived;
  const updateWeather = useCallback((id: WeatherLayerId, view: WeatherLayerView | null) => {
    setWeather((previous) => {
      const next = { ...previous };
      if (view) next[id] = view;
      else delete next[id];
      return next;
    });
  }, []);
  const radarActive = enabled.radar && active;
  useEffect(() => {
    if (!radarActive) updateRadar(null);
  }, [radarActive]);
  const radar = useMemo<RadarLayerView | null>(
    () =>
      radarActive
        ? { kind: "radar-layer", region: "world", image: radarView?.image ?? null, at: radarView?.at }
        : null,
    [radarActive, radarView],
  );
  const latest = useRef(enabled);
  const change = useCallback((layer: MapLayer, on: boolean) => {
    const next = { ...latest.current, [layer]: on };
    latest.current = next;
    store("mapLayers", JSON.stringify(next));
    setEnabled(next);
    if (on && (layer === "radar" || layer in weatherLayers)) expand(layer as PlaybackLayer);
  }, []);
  const globeFilters = useMemo(
    () => (enabled.earthquakes ? filters : { ...filters, sources: new Set<"usgs" | "emsc">() }),
    [filters, enabled.earthquakes],
  );
  const radarCaption =
    radar?.at === undefined
      ? null
      : `Weather data by RainViewer · radar ${new Date(radar.at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const wind = active && enabled.wind ? weather.wind : undefined;
  const lightning = active && enabled.lightning ? weather.lightning : undefined;
  const observation = useMemo(
    () => weatherOverlay(wind?.frame, lightning?.frame),
    [wind?.frame, lightning?.frame],
  );
  const presentation = useMemo<MapLayerPresentation | null>(
    () => (radar || observation ? { kind: "map-layers", radar, observation } : null),
    [radar, observation],
  );
  const compose = useMemo(() => composeMapLayers(presentation), [presentation]);
  const feeds: FeedRow[] = [
    {
      id: "radar",
      label: "RainViewer storm radar",
      state: radarActive ? (radarView?.feed?.state ?? "pending") : "off",
      lastCheck: radarActive ? radarView?.feed?.lastCheck : undefined,
      message: radarActive ? radarView?.feed?.message : enabled.radar ? "Paused in this view" : undefined,
    },
    ...Object.entries(weatherLayers).map(([key, meta]) => {
      const id = key as WeatherLayerId;
      const running = active && enabled[id];
      return {
        id,
        label: meta.source,
        state: running ? (weather[id]?.feed.state ?? "pending") : "off",
        lastCheck: running ? weather[id]?.feed.lastCheck : undefined,
        message: running ? weather[id]?.feed.message : enabled[id] ? "Paused in this view" : undefined,
      } satisfies FeedRow;
    }),
  ];
  return {
    enabled,
    change,
    globeFilters,
    radar,
    updateRadar,
    active,
    expanded,
    expand,
    selectedTimes,
    selectTime,
    updateWeather,
    weather,
    compose,
    feeds,
    captureNote: (inspection: string | null) =>
      [
        radarCaption,
        ...(["wind", "lightning"] as const).flatMap((id) =>
          active && enabled[id]
            ? [
                `${weatherLayers[id].source} · ${weather[id]?.frame ? `${new Date(weather[id]!.frame!.at).toISOString()}${weather[id]?.feed.state === "failed" ? " · last available" : ""}` : weather[id]?.feed.state === "failed" ? "unavailable" : "no recent data"}`,
              ]
            : [],
        ),
        inspection,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    canCapture:
      (!radar || !!radar.image) &&
      (!active ||
        (["wind", "lightning"] as const).every(
          (id) =>
            !enabled[id] ||
            (!!weather[id] && (weather[id]!.feed.state !== "pending" || !!weather[id]!.frame)),
        )),
  };
}
