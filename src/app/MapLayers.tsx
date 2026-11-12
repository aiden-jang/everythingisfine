import { mapLayerNames, type MapLayer } from "./layerVisibility";
import type { useMapLayers } from "./useMapLayers";
import type { FeedStatus } from "./feedStatus";
import "./map-layers.css";
import { lazy, Suspense } from "react";

const RadarLayer = lazy(() =>
  import("./radar/RadarLayer").then(({ RadarLayer }) => ({ default: RadarLayer })),
);

const coverage: Record<MapLayer, string> = {
  earthquakes: "Global reports",
  cyclones: "Global tracks",
  fires: "Reported fires",
  floods: "Reported floods",
  volcanoes: "Eruption episodes",
  aurora: "Polar forecast",
  radar: "Recent scans · worldwide network",
};

export function MapLayers({
  controls,
  feeds,
  archived,
  onBrowse,
}: {
  controls: ReturnType<typeof useMapLayers>;
  feeds: FeedStatus;
  archived: boolean;
  onBrowse: () => void;
}): JSX.Element {
  return (
    <section className="map-layers" aria-label="Map layers">
      <h2>Layers on the globe</h2>
      <div className="map-layer-switches">
        {(Object.keys(mapLayerNames) as MapLayer[]).map((layer) => {
          const sources = feeds.rows.filter(({ id }) =>
            layer === "earthquakes" ? id === "usgs" || id === "emsc" : id === layer,
          );
          const unavailable =
            !archived && sources.length > 0 && sources.every(({ state }) => state === "failed");
          const disabled = archived && (layer === "aurora" || layer === "radar");
          return (
            <button
              type="button"
              key={layer}
              id={layer === "radar" ? "open-explorer-radar" : undefined}
              aria-pressed={controls.enabled[layer] && !disabled}
              aria-label={mapLayerNames[layer]}
              aria-describedby={`map-layer-${layer}`}
              aria-controls={layer === "radar" && controls.radar ? "radar-layer-controls" : undefined}
              disabled={disabled}
              data-unavailable={unavailable || disabled || undefined}
              onClick={() => controls.change(layer, !controls.enabled[layer])}
            >
              <span>
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="m2 6 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                {mapLayerNames[layer]}
              </span>
              <small id={`map-layer-${layer}`}>
                {disabled
                  ? layer === "radar"
                    ? "Return to live for recent scans"
                    : "No archive forecast"
                  : unavailable
                    ? "Feed unavailable"
                    : coverage[layer]}
              </small>
            </button>
          );
        })}
      </div>
      {controls.radar && (
        <Suspense
          fallback={
            <p className="radar-layer-loading" role="status">
              Loading radar controls…
            </p>
          }
        >
          <RadarLayer onView={controls.updateRadar} />
        </Suspense>
      )}
      <button type="button" className="map-layer-open" onClick={onBrowse}>
        <span>All stories & data</span>
        <small>Ocean, weather, space and recorded journeys</small>
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
