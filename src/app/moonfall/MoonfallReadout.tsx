import { lunarTraverses } from "../../sources/moonfall/traverses";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { refreshAnnotations } from "../../globe/annotationInput";
import type { MoonfallView } from "../../globe/moonfall/scene";

export function MoonfallReadout({ view, wake }: { view: MoonfallView; wake: () => void }): JSX.Element {
  const { phase, flying, eva, station, meters, mapped, turning } = useSyncExternalStore(
    view.subscribe,
    view.read,
  );
  const stops = lunarTraverses[eva]!.stations;
  const locator = station === null ? (meters <= 0 ? "Landing site" : "Along the traverse") : stops[station];

  useLayoutEffect(() => refreshAnnotations(), [view, eva, flying]);
  function project(next: boolean) {
    view.project(next);
    wake();
  }
  return (
    <div className="observatory-stage" data-stage="moonfall" role="group" aria-label="Lunar view">
      <div className="stage-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>{phase}</span>
      </div>
      {!flying && (
        <div
          className="moonfall-stops"
          role="group"
          aria-label="Stops on the traverse"
          data-turning={turning || undefined}
        >
          {stops.map((name, index) => (
            <button
              key={name}
              type="button"
              aria-label={`Inspect ${name}`}
              title={name}
              aria-pressed={index === station}
              onClick={() => {
                view.stopAt(index);
                wake();
              }}
            />
          ))}
        </div>
      )}
      <div className="stage-readout moonfall-stage-readout">
        {flying ? (
          <span>Apollo 17 · 1972</span>
        ) : (
          <>
            <div className="moonfall-locator">
              <span>Apollo 17 · Traverse {eva + 1}</span>
              <strong>{locator}</strong>
            </div>
            <div className="moonfall-projection" role="group" aria-label="Lunar projection">
              <button type="button" aria-pressed={!mapped} onClick={() => project(false)}>
                Terrain
              </button>
              <button type="button" aria-pressed={mapped} onClick={() => project(true)}>
                Landing map
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
