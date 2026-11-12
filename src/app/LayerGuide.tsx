import { mapLayerNames, type MapLayer, type MapLayers } from "./layerVisibility";
import { layerMetadata } from "./layerMetadata";

export function LayerGuide({ enabled }: { enabled: MapLayers }): JSX.Element {
  const visible = (Object.keys(mapLayerNames) as MapLayer[]).filter((id) => enabled[id]);
  return (
    <details className="layer-guide">
      <summary>Layer guide</summary>
      <p>Layers have independent times and coverage. Open their controls or select an event for details.</p>
      {visible.length ? (
        <dl>
          {visible.map((id) => (
            <div key={id}>
              <dt>{mapLayerNames[id]}</dt>
              <dd>{layerMetadata[id].meaning}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>All layers are off. Turn on a layer to see its observations and guide.</p>
      )}
    </details>
  );
}
