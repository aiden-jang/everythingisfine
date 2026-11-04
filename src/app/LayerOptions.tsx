import { LayerToggle } from "./LayerToggle";
import type { MagnitudeFilterProps } from "./MagnitudeFilter";

type Props = {
  [
    K in
      | "sinkOn"
      | "onSink"
      | "cutawayOn"
      | "onCutaway"
      | "motionOn"
      | "onMotion"
      | "slabOn"
      | "onSlab"
      | "figuresOn"
      | "onFigures"
  ]: MagnitudeFilterProps[K];
};

export function LayerOptions(p: Props): JSX.Element {
  return (
    <div className="mt-3">
      <span className="label block">Layers</span>
      <div role="group" aria-label="Layers" className="layer-options mt-1">
        {p.sinkOn === null ? null : <LayerToggle label="depth" on={p.sinkOn} onChange={p.onSink} />}
        {p.cutawayOn === null ? null : (
          <LayerToggle label="Regional cutaway" on={p.cutawayOn} onChange={p.onCutaway} />
        )}
        <LayerToggle label="Plate movement" on={p.motionOn} onChange={p.onMotion} />
        {p.slabOn === null ? null : (
          <LayerToggle label="Deep earthquakes" on={p.slabOn} onChange={p.onSlab} />
        )}
        {p.figuresOn == null || !p.onFigures ? null : (
          <LayerToggle label="Constellations" on={p.figuresOn} onChange={p.onFigures} />
        )}
      </div>
    </div>
  );
}
