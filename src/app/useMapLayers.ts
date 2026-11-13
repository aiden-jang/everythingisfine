import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Filters } from "../data/types";
import { stored, store } from "./stored";
import { isolateLayer, mapLayerNames, readMapLayers, type MapLayer } from "./layerVisibility";
import { layerTime } from "./layerTime";
import type { RadarLayerView, RadarView } from "./radar/radarCamera";
import type { FeedRow } from "./feedStatus";
import { latestLayerTimes, type LayerTimes, type SharedLayers } from "./layerLink";
import {
  weatherLayers,
  weatherOverlay,
  composeMapLayers,
  type WeatherLayerId,
  type WeatherLayerView,
  type PlaybackLayer,
  type MapLayerPresentation,
} from "./weatherLayers";

export function useMapLayers(
  filters: Filters,
  background: boolean,
  target?: string,
  archived = false,
  shared: SharedLayers = {},
  suspended = false,
) {
  const [savedLayers, setEnabled] = useState(() =>
    readMapLayers(shared.layers ? JSON.stringify(shared.layers) : stored("mapLayers"), target),
  );
  const [isolated, setIsolated] = useState<MapLayer | null>(null);
  const enabled = useMemo(
    () => isolateLayer(savedLayers, archived ? null : isolated),
    [savedLayers, archived, isolated],
  );
  const [radarView, updateRadar] = useState<RadarView | null>(null);
  const [weather, setWeather] = useState<Partial<Record<WeatherLayerId, WeatherLayerView>>>({});
  const [inspector, inspect] = useState<MapLayer | null>(() =>
    archived || target?.startsWith("quake:") ? "earthquakes" : null,
  );
  const [selectedTimes, setSelectedTimes] = useState<LayerTimes>(
    () => shared.layerTimes ?? { ...latestLayerTimes },
  );
  const selectTime = useCallback((id: PlaybackLayer, at: number | null) => {
    setSelectedTimes((previous) => ({ ...previous, [id]: at }));
  }, []);
  const active = (background || suspended) && !archived;
  const visible = useMemo(
    () =>
      suspended
        ? (Object.fromEntries(Object.keys(enabled).map((id) => [id, false])) as typeof enabled)
        : enabled,
    [enabled, suspended],
  );
  useEffect(() => {
    if (archived) setIsolated(null);
  }, [archived]);
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
  const latest = useRef(savedLayers);
  const change = useCallback((layer: MapLayer, on: boolean) => {
    setIsolated(null);
    const next = { ...latest.current, [layer]: on };
    latest.current = next;
    store("mapLayers", JSON.stringify(next));
    setEnabled(next);
  }, []);
  const globeFilters = useMemo(
    () => (visible.earthquakes ? filters : { ...filters, sources: new Set<"usgs" | "emsc">() }),
    [filters, visible.earthquakes],
  );
  const radarCaption =
    suspended || radar?.at === undefined ? null : `Weather data by RainViewer · radar ${layerTime(radar.at)}`;
  const wind = active && enabled.wind ? weather.wind : undefined;
  const lightning = active && enabled.lightning ? weather.lightning : undefined;
  const observation = useMemo(
    () => weatherOverlay(wind?.frame, lightning?.frame),
    [wind?.frame, lightning?.frame],
  );
  const presentation = useMemo<MapLayerPresentation | null>(
    () => (!suspended && (radar || observation) ? { kind: "map-layers", radar, observation } : null),
    [radar, observation, suspended],
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
    visible,
    suspended,
    inspector,
    inspect,
    isolated: archived ? null : isolated,
    isolate(layer: MapLayer | null) {
      setIsolated(layer);
    },
    change,
    globeFilters,
    radar,
    updateRadar,
    active,
    selectedTimes,
    radarAt: radarView?.selectedAt ?? selectedTimes.radar ?? undefined,
    selectTime,
    updateWeather,
    weather,
    compose,
    feeds,
    captureNote: (inspection: string | null) =>
      [
        active && !suspended
          ? `Layers: ${
              (Object.keys(enabled) as MapLayer[])
                .filter((id) => enabled[id])
                .map((id) => mapLayerNames[id])
                .join(", ") || "all off"
            }`
          : null,
        radarCaption,
        ...(["wind", "lightning"] as const).flatMap((id) =>
          active && !suspended && enabled[id]
            ? [
                `${weatherLayers[id].source} · ${weather[id]?.frame ? `${layerTime(weather[id]!.frame!.at)}${weather[id]?.lastAvailable ? " · last available" : ""}` : weather[id]?.feed.state === "failed" ? "unavailable" : "no recent data"}`,
              ]
            : [],
        ),
        suspended ? null : inspection,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    canCapture:
      suspended ||
      ((!radar || !!radar.image) &&
        (!active ||
          (["wind", "lightning"] as const).every(
            (id) =>
              !enabled[id] ||
              (!!weather[id] && (weather[id]!.feed.state !== "pending" || !!weather[id]!.frame)),
          ))),
  };
}
