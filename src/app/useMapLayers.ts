import { useCallback, useMemo, useRef, useState } from "react";
import type { Filters } from "../data/types";
import { stored, store } from "./stored";
import { readMapLayers, type MapLayer } from "./layerVisibility";

export function useMapLayers(filters: Filters, observing: boolean, target?: string) {
  const [enabled, setEnabled] = useState(() => readMapLayers(stored("mapLayers"), target));
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
  return { enabled, change, globeFilters };
}
