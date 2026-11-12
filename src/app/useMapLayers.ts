import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Filters } from "../data/types";
import { stored, store } from "./stored";
import { readMapLayers, type MapLayer } from "./layerVisibility";
import type { RadarLayerView, RadarView } from "./radar/radarCamera";

export function useMapLayers(filters: Filters, observing: boolean, target?: string, archived = false) {
  const [enabled, setEnabled] = useState(() => readMapLayers(stored("mapLayers"), target));
  const [radarView, updateRadar] = useState<RadarView | null>(null);
  const radarActive = enabled.radar && !observing && !archived;
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
  }, []);
  const globeFilters = useMemo(
    () => (observing || enabled.earthquakes ? filters : { ...filters, sources: new Set<"usgs" | "emsc">() }),
    [filters, observing, enabled.earthquakes],
  );
  const radarCaption =
    radar?.at === undefined
      ? null
      : `Weather data by RainViewer · radar ${new Date(radar.at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return {
    enabled,
    change,
    globeFilters,
    radar,
    updateRadar,
    captureNote: (inspection: string | null) =>
      [radarCaption, inspection].filter(Boolean).join(" · ") || null,
    canCapture: !radar || !!radar.image,
  };
}
