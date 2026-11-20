import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { refreshAnnotations } from "../globe/annotationInput";
import { LayerIcon } from "./LayerIcon";
import type { MapLayer } from "./layerVisibility";

const labels = {
  earthquakes: "Earthquake",
  cyclones: "Tropical cyclone",
  fires: "Wildfire",
  floods: "Flood report",
  volcanoes: "Volcanic activity",
};
type ReportLayer = keyof typeof labels;

export function hasLayerExample(layer: MapLayer): layer is ReportLayer {
  return Object.hasOwn(labels, layer);
}

export function LayerExample({ layer }: { layer: ReportLayer }) {
  useLayoutEffect(() => refreshAnnotations(), [layer]);
  const world = document.getElementById("globe-view");
  return world
    ? createPortal(
        <span className="scene-cue scene-layer-example" data-layer-example={layer} aria-hidden="true">
          <span className="scene-example-ring" />
          <span className="scene-cue-label">
            <LayerIcon layer={layer} />
            <span data-example-label>{labels[layer]}</span>
          </span>
        </span>,
        world,
      )
    : null;
}
