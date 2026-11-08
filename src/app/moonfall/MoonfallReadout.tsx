import { useSyncExternalStore } from "react";
import type { MoonfallView } from "../../globe/moonfall/scene";

export function MoonfallReadout({ view }: { view: MoonfallView }): JSX.Element {
  const { phase, flying, eva } = useSyncExternalStore(view.subscribe, view.read);
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
      <div className="stage-readout moonfall-stage-readout">
        <span>{flying ? "Apollo 17 · 1972" : `Apollo 17 · Traverse ${eva + 1}`}</span>
        {!flying && <span>20.19° N · 30.77° E</span>}
      </div>
    </div>
  );
}
