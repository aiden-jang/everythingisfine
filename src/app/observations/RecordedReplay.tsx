import { RelatedStories } from "./RelatedStories";
import { lazy, useLayoutEffect, useRef, type ReactNode } from "react";
import { useObservatoryEscape } from "../useObservatoryEscape";
import { ObservationCredit } from "./ObservationCredit";
import type { ObservationView } from "./types";
import type { ReplayId } from "./replays";
import { ShareMoment } from "./StorySession";
import "../archive-scene.css";
import "../storm/storm.css";
import "../megaflash/megaflash.css";
import "../rupture/recorded-waves.css";
import "../tonga/tonga.css";

export interface ReplayProps {
  map: boolean;
  onMap: (map: boolean) => void;
  onView: (view: ObservationView) => void;
  onClose: () => void;
  closeLabel: string;
}

const scenes = {
  rupture: lazy(() =>
    import("../rupture/RuptureStage").then(({ RuptureStage }) => ({ default: RuptureStage })),
  ),
  katrina: lazy(() => import("../storm/StormStage").then(({ StormStage }) => ({ default: StormStage }))),
  tonga: lazy(() => import("../tonga/TongaStage").then(({ TongaStage }) => ({ default: TongaStage }))),
  megaflash: lazy(() =>
    import("../megaflash/MegaflashStage").then(({ MegaflashStage }) => ({ default: MegaflashStage })),
  ),
};

export function RecordedReplay({ entry, ...props }: ReplayProps & { entry: ReplayId }): JSX.Element {
  const Stage = scenes[entry];
  return <Stage {...props} />;
}

export function ReplayPanel({
  map,
  onMap,
  onClose,
  closeLabel,
  title,
  location,
  subtitle,
  status,
  at,
  inset,
  sources,
  children,
}: Omit<ReplayProps, "onView"> & {
  title: string;
  location: string;
  subtitle: string;
  status: ReactNode;
  at?: ReactNode;
  inset?: ReactNode;
  sources: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useObservatoryEscape(onClose);
  return (
    <>
      <div
        className="observatory-stage"
        data-stage="observation"
        role="group"
        aria-label={`${title} on the ${map ? "map" : "globe"}`}
      >
        {inset}
        <div className="stage-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          {location}
        </div>
        <div className="stage-readout">
          <span>{status}</span>
          {at}
        </div>
      </div>
      <div className="observatory-sidebar">
        <section id="observatory-intro" className="observatory-intro observation-panel" aria-label={title}>
          <div className="observation-heading">
            <h2>{title}</h2>
            <div className="observatory-actions">
              <button type="button" ref={back} onClick={onClose} aria-label={closeLabel}>
                <span className="observation-back-full">{closeLabel}</span>
                <span className="observation-back-compact">Back</span>
              </button>
            </div>
          </div>
          <p className="observation-note">{subtitle}</p>
          <div className="observatory-actions" role="group" aria-label="Observation projection">
            <button type="button" aria-pressed={!map} onClick={() => onMap(false)}>
              Globe
            </button>
            <button type="button" aria-pressed={map} onClick={() => onMap(true)}>
              Map
            </button>
          </div>
          {children}
          <ShareMoment />
          <RelatedStories />
          <details className="replay-sources">
            <summary>Replay sources</summary>
            <div>{sources}</div>
          </details>
        </section>
        <ObservationCredit />
      </div>
    </>
  );
}
