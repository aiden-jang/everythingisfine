import { mapLayerNames, type MapLayer } from "./layerVisibility";
import { layerHealth, layerMetadata } from "./layerMetadata";
import type { FeedStatus } from "./feedStatus";
import type { useMapLayers } from "./useMapLayers";
import { LayerIcon } from "./LayerIcon";

const groups: { name: string; layers: MapLayer[] }[] = [
  { name: "Weather & sky", layers: ["radar", "wind", "lightning", "aurora"] },
  { name: "Reported events", layers: ["earthquakes", "cyclones", "fires", "floods", "volcanoes"] },
];

export function LayerVisibility({
  layer,
  on,
  disabled,
  onChange,
}: {
  layer: MapLayer;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="layer-visibility"
      aria-label={mapLayerNames[layer]}
      aria-description={`Toggle ${mapLayerNames[layer].toLowerCase()} visibility`}
      aria-pressed={on && !disabled}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="layer-switch" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

export function LayerCatalogue({
  controls,
  feeds,
  disabled,
  archived,
  onInspect,
}: {
  controls: ReturnType<typeof useMapLayers>;
  feeds: FeedStatus;
  disabled: (id: MapLayer) => boolean;
  archived: boolean;
  onInspect: (id: MapLayer) => void;
}) {
  return (
    <div className="layer-list">
      {groups.map((group) => (
        <section className="layer-group" aria-label={group.name} key={group.name}>
          <h2>{group.name}</h2>
          {group.layers.map((id) => {
            const status = disabled(id)
              ? "Unavailable in this archive"
              : !archived && controls.enabled[id]
                ? layerHealth(id, feeds.rows)
                : null;
            return (
              <div className="layer-row" key={id}>
                <button
                  type="button"
                  id={`inspect-${id}`}
                  className="layer-inspect"
                  aria-label={`${mapLayerNames[id]} details`}
                  aria-describedby={`layer-${id}-coverage`}
                  onClick={() => onInspect(id)}
                >
                  <LayerIcon layer={id} />
                  <span className="layer-name">{mapLayerNames[id]}</span>
                  <svg
                    className="layer-chevron"
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    aria-hidden="true"
                  >
                    <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <small id={`layer-${id}-coverage`} className={status ? "layer-status" : "sr-only"}>
                    {status ?? layerMetadata[id].coverage}
                  </small>
                </button>
                <LayerVisibility
                  layer={id}
                  on={controls.enabled[id]}
                  disabled={disabled(id)}
                  onChange={(on) => controls.change(id, on)}
                />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
