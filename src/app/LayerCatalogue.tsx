import { Fragment, type ReactNode } from "react";
import { mapLayerNames, type MapLayer } from "./layerVisibility";
import { layerMetadata } from "./layerMetadata";
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
  quiet,
  disabled,
  onInspect,
  radar,
}: {
  controls: ReturnType<typeof useMapLayers>;
  quiet: (id: MapLayer) => string | null;
  disabled: (id: MapLayer) => boolean;
  onInspect: (id: MapLayer) => void;
  radar: ReactNode;
}) {
  return (
    <div className="layer-list" data-inspecting={controls.inspector !== null || undefined}>
      {groups.map((group) => (
        <section
          className="layer-group"
          aria-label={group.name}
          key={group.name}
          hidden={group.name === "Reported events" && controls.inspector !== null}
        >
          <h2 hidden={controls.inspector !== null}>{group.name}</h2>
          {group.layers.map((id) => {
            const status = disabled(id)
              ? "Unavailable in this archive"
              : controls.enabled[id]
                ? quiet(id)
                : null;
            return (
              <Fragment key={id}>
                <div className="layer-row" hidden={controls.inspector !== null}>
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
                {id === "radar" && radar}
              </Fragment>
            );
          })}
        </section>
      ))}
    </div>
  );
}
