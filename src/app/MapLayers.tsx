import { lazy, Suspense, useRef, type ReactNode } from "react";
import { PlaceContext, type PlaceContextProps } from "./discovery/PlaceContext";
import { mapLayerNames, type MapLayer } from "./layerVisibility";
import type { useMapLayers } from "./useMapLayers";
import type { FeedStatus } from "./feedStatus";
import { weatherLayers, type WeatherLayerId } from "./weatherLayers";
import { layerHealth, layerMetadata } from "./layerMetadata";
import type { Aurora } from "../sources/aurora";
import { layerTime } from "./layerTime";
import { useStoryNavigation } from "./journeys/StoryNavigation";
import { LayerCatalogue, LayerVisibility } from "./LayerCatalogue";
import { LayerSources } from "./LayerSources";
import { HazardList } from "./HazardList";
import "./map-layers.css";
import "./discovery/discovery.css";

const RadarLayer = lazy(() =>
  import("./radar/RadarLayer").then(({ RadarLayer }) => ({ default: RadarLayer })),
);
const WeatherLayer = lazy(() =>
  import("./WeatherLayer").then(({ WeatherLayer }) => ({ default: WeatherLayer })),
);
const hazardKinds = { cyclones: "cyclone", fires: "fire", floods: "flood", volcanoes: "volcano" } as const;

export function MapLayers({
  controls,
  places,
  feeds,
  archived,
  aurora,
  children,
  window,
  markId,
  onHazard,
  flat,
  canDismiss,
}: {
  controls: ReturnType<typeof useMapLayers>;
  places: PlaceContextProps;
  feeds: FeedStatus;
  archived: boolean;
  aurora: Aurora | null;
  children: ReactNode;
  window: ReactNode;
  markId: string | null;
  onHazard: (id: string) => void;
  flat: boolean;
  canDismiss: boolean;
}) {
  const navigation = useStoryNavigation();
  const layer = controls.inspector;
  const disabled = (id: MapLayer) => archived && (id === "aurora" || id === "radar" || id in weatherLayers);
  const listScroll = useRef(0);
  const inspect = (id: MapLayer) => {
    listScroll.current = document.getElementById("chrome-rail")?.scrollTop ?? 0;
    controls.inspect(id);
    requestAnimationFrame(() => {
      document.getElementById("chrome-rail")?.scrollTo({ top: 0 });
      document.getElementById("layer-inspector-title")?.focus({ preventScroll: true });
    });
  };
  const back = () => {
    controls.inspect(null);
    requestAnimationFrame(() => {
      document.getElementById("chrome-rail")?.scrollTo({ top: listScroll.current });
      document.getElementById(`inspect-${layer}`)?.focus({ preventScroll: true });
    });
  };
  const health = layer ? layerHealth(layer, feeds.rows) : null;
  const hazardKind = layer && layer in hazardKinds ? hazardKinds[layer as keyof typeof hazardKinds] : null;
  const groups = places.hazards.filter((group) => group.kind === hazardKind);
  return (
    <section
      className="map-layers"
      aria-label="Map layers"
      onKeyDown={(event) => {
        if (event.key === "Escape" && layer && canDismiss && !document.querySelector(":popover-open")) {
          event.preventDefault();
          event.stopPropagation();
          back();
        }
      }}
    >
      {controls.isolated && (
        <div className="layer-isolation" role="status">
          <span>Only {mapLayerNames[controls.isolated].toLowerCase()}</span>
          <button type="button" onClick={() => controls.isolate(null)}>
            Restore layers
          </button>
        </div>
      )}
      <div hidden={layer !== null}>
        {!archived && <PlaceContext {...places} />}
        <LayerCatalogue
          controls={controls}
          feeds={feeds}
          archived={archived}
          disabled={disabled}
          onInspect={inspect}
        />
        {Object.values(controls.enabled).every((on) => !on) && (
          <p role="status">All layers are off. Choose a layer to show its observations.</p>
        )}
      </div>
      {layer && (
        <div className="layer-inspector-heading">
          <button type="button" onClick={back}>
            Back to layers
          </button>
          <div>
            <h2 id="layer-inspector-title" tabIndex={-1}>
              {mapLayerNames[layer]}
            </h2>
            <LayerVisibility
              layer={layer}
              on={controls.enabled[layer]}
              disabled={disabled(layer)}
              onChange={(on) => controls.change(layer, on)}
            />
          </div>
          <p>{layerMetadata[layer].coverage}</p>
          {disabled(layer) ? (
            <p role="status">
              Return to live to view this layer. This source has no data for the selected archive.
            </p>
          ) : !controls.enabled[layer] ? (
            <p>This layer is hidden. Turn it on to show its observations.</p>
          ) : health ? (
            <p role="status">{health}</p>
          ) : null}
        </div>
      )}
      <div hidden={layer !== "earthquakes"}>{children}</div>
      {hazardKind && (
        <section aria-label={`${mapLayerNames[layer!]} reports`} className="layer-reports">
          {window}
          <p>Reported events in the selected window. This window is shared with the earthquake reports.</p>
          {groups.length ? (
            <HazardList hazards={groups} markId={markId} onHazard={onHazard} inline />
          ) : (
            <p role="status">
              {!controls.enabled[layer!]
                ? "Enable this layer to see reports."
                : (health ??
                  "No matching reports from the available sources. This does not establish an absence of activity.")}
            </p>
          )}
        </section>
      )}
      {layer === "aurora" && controls.enabled.aurora && !archived && (
        <p className="layer-note">
          {aurora ? (
            <>
              {aurora.estimatedTime ? (
                "Forecast time not supplied by NOAA."
              ) : (
                <>
                  <span>Forecast valid for </span>
                  <time dateTime={new Date(aurora.forecastAt).toISOString()}>
                    {layerTime(aurora.forecastAt)}
                  </time>
                  .
                </>
              )}{" "}
              Peak modeled probability: {aurora.peak}%. This is a forecast, not an observation of visible
              aurora.
            </>
          ) : (
            (health ?? "No forecast is available yet.")
          )}
        </p>
      )}
      {/* Players stay mounted while inspecting another layer, preserving scan time and subscriptions. */}
      <div hidden={layer !== "radar"}>
        {controls.radar && (
          <Suspense fallback={<p role="status">Loading radar controls…</p>}>
            <RadarLayer
              onView={controls.updateRadar}
              initialAt={controls.selectedTimes.radar}
              onSelect={controls.selectTime}
            />
          </Suspense>
        )}
        {layer === "radar" && !archived && (
          <button
            type="button"
            id="open-explorer-radar"
            className="layer-story-link"
            onClick={() => navigation?.openRadar(controls.radarAt, flat)}
          >
            Follow a radar region <span>Guided view · same available scans</span>
          </button>
        )}
      </div>
      {controls.active &&
        (Object.keys(weatherLayers) as WeatherLayerId[]).map(
          (id) =>
            controls.enabled[id] && (
              <div key={id} hidden={layer !== id}>
                <Suspense fallback={<p role="status">Loading {weatherLayers[id].label.toLowerCase()}…</p>}>
                  <WeatherLayer
                    id={id}
                    onView={controls.updateWeather}
                    selectedAt={controls.selectedTimes[id]}
                    onSelect={controls.selectTime}
                  />
                </Suspense>
              </div>
            ),
        )}
      {layer && !archived && (
        <button
          type="button"
          className="layer-solo"
          onClick={() => controls.isolate(controls.isolated === layer ? null : layer)}
        >
          {controls.isolated === layer ? "Restore chosen layers" : "Show only this layer"}
        </button>
      )}
      {layer && <LayerSources layer={layer} feeds={feeds} />}
    </section>
  );
}
