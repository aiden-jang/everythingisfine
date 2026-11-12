import { mapLayerNames, type MapLayer } from "./layerVisibility";
import type { useMapLayers } from "./useMapLayers";
import type { FeedStatus } from "./feedStatus";
import "./map-layers.css";
import { lazy, Suspense, useRef } from "react";
import { weatherLayers, type WeatherLayerId, type PlaybackLayer } from "./weatherLayers";
import { LayerPlayback } from "./LayerPlayback";

const RadarLayer = lazy(() =>
  import("./radar/RadarLayer").then(({ RadarLayer }) => ({ default: RadarLayer })),
);
const WeatherLayer = lazy(() =>
  import("./WeatherLayer").then(({ WeatherLayer }) => ({ default: WeatherLayer })),
);

const coverage: Record<MapLayer, string> = {
  earthquakes: "Global reports",
  cyclones: "Global tracks",
  fires: "Reported fires",
  floods: "Reported floods",
  volcanoes: "Eruption episodes",
  aurora: "Polar forecast",
  radar: "Recent scans · worldwide network",
  wind: weatherLayers.wind.coverage,
  lightning: weatherLayers.lightning.coverage,
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
  const picker = useRef<HTMLDetailsElement>(null);
  const toggle = (layer: MapLayer) => {
    const on = !controls.enabled[layer];
    controls.change(layer, on);
    if (!on && layer in weatherLayers) picker.current?.querySelector("summary")?.focus();
  };
  const expand = (id: PlaybackLayer) => controls.expand(controls.expanded === id ? null : id);
  return (
    <section className="map-layers" aria-label="Map layers">
      <h2>Layers on the globe</h2>
      <div className="map-layer-switches">
        {(Object.keys(mapLayerNames) as MapLayer[]).map((layer) => {
          if (layer in weatherLayers && !controls.enabled[layer]) return null;
          const sources = feeds.rows.filter(({ id }) =>
            layer === "earthquakes" ? id === "usgs" || id === "emsc" : id === layer,
          );
          const unavailable =
            !archived && sources.length > 0 && sources.every(({ state }) => state === "failed");
          const disabled = archived && (layer === "aurora" || layer === "radar" || layer in weatherLayers);
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
              onClick={() => toggle(layer)}
            >
              <span>
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="m2 6 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                {mapLayerNames[layer]}
              </span>
              <small id={`map-layer-${layer}`}>
                {disabled
                  ? layer !== "aurora"
                    ? "Return to live for recent data"
                    : "No archive forecast"
                  : unavailable
                    ? "Feed unavailable"
                    : coverage[layer]}
              </small>
            </button>
          );
        })}
      </div>
      <details className="map-layer-picker" ref={picker}>
        <summary>Add layer</summary>
        <div className="map-layer-switches" role="group" aria-label="Weather layers">
          {(Object.keys(weatherLayers) as WeatherLayerId[]).map((id) => (
            <button
              type="button"
              key={id}
              disabled={archived || controls.enabled[id]}
              onClick={() => {
                controls.change(id, true);
                if (picker.current) picker.current.open = false;
                requestAnimationFrame(() => document.getElementById(`${id}-playback-toggle`)?.focus());
              }}
            >
              <span>
                {controls.enabled[id] ? "Added" : "Add"} {weatherLayers[id].label.toLowerCase()}
              </span>
              <small>{weatherLayers[id].coverage}</small>
            </button>
          ))}
        </div>
        {archived && <p>Return to live to add weather layers.</p>}
      </details>
      {controls.radar && (
        <LayerPlayback
          id="radar"
          expanded={controls.expanded === "radar"}
          at={controls.radar.at}
          state={feeds.rows.find(({ id }) => id === "radar")?.state ?? "pending"}
          onToggle={() => expand("radar")}
        >
          <Suspense
            fallback={
              <p className="radar-layer-loading" role="status">
                Loading radar controls…
              </p>
            }
          >
            <RadarLayer onView={controls.updateRadar} />
          </Suspense>
        </LayerPlayback>
      )}
      {controls.active &&
        (Object.keys(weatherLayers) as WeatherLayerId[]).map(
          (id) =>
            controls.enabled[id] && (
              <LayerPlayback
                key={id}
                id={id}
                expanded={controls.expanded === id}
                at={controls.weather[id]?.frame?.at}
                state={controls.weather[id]?.feed.state ?? "pending"}
                onToggle={() => expand(id)}
              >
                <Suspense
                  fallback={<p role="status">Loading {weatherLayers[id].label.toLowerCase()} controls…</p>}
                >
                  <WeatherLayer id={id} onView={controls.updateWeather} />
                </Suspense>
              </LayerPlayback>
            ),
        )}
      <button type="button" className="map-layer-open" onClick={onBrowse}>
        <span>All stories & data</span>
        <small>Ocean, weather, space and recorded journeys</small>
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
