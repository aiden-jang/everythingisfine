import { StoryDeparture } from "./StoryDeparture";
import type { StoryMoment } from "./storyMoment";
import { SharedStory } from "./SharedStory";
import { ExperienceEnding } from "../journeys/ExperienceEnding";
import { lazy, useLayoutEffect, useRef, type ReactNode } from "react";
import { useObservatoryEscape } from "../useObservatoryEscape";
import type { CameraState } from "../../globe/controls";
import type { ObservationView } from "./types";
import type { ReplayId } from "./replays";
import { ShareMoment } from "./StorySession";
import { StoryDockProvider } from "./StoryDock";
import { StoryProjection } from "./StoryProjection";
import "../archive-scene.css";
import "../storm/storm.css";
import "../kilauea/kilauea.css";
import "../megaflash/megaflash.css";
import "../rupture/recorded-waves.css";
import "../tonga/tonga.css";
import "../tonga/tonga-journey.css";
import "../tonga/tonga-evidence.css";
import "./world-evidence.css";

export interface ReplayProps {
  map: boolean;
  readCamera?: () => CameraState;
  restoreCamera?: (camera: CameraState) => void;
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
  focusOnEntry = true,
  ending = true,
  finding = true,
  save = true,
  className = "",
  sharing = true,
  sharedMoment,
  evidence,
  horizon = false,
  projection,
}: Omit<ReplayProps, "onView"> & {
  title: string;
  location: string;
  subtitle: string;
  status: ReactNode;
  at?: ReactNode;
  inset?: ReactNode;
  sources: ReactNode;
  children: ReactNode;
  focusOnEntry?: boolean;
  ending?: boolean;
  finding?: boolean;
  save?: boolean;
  className?: string;
  sharing?: boolean;
  sharedMoment?: StoryMoment | undefined;
  evidence?: ReactNode;
  horizon?: boolean;
  projection?: ReactNode;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusOnEntry) back.current?.focus({ preventScroll: true });
  }, [focusOnEntry]);
  useObservatoryEscape(onClose);
  return (
    <section className={`replay-region ${className}`} aria-label={title}>
      <div
        className="observatory-stage replay-stage"
        data-stage="observation"
        role="group"
        aria-label={`${title} on the ${horizon ? "horizon" : map ? "map" : "globe"}`}
      >
        <StoryDeparture />
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
        {(status || at) && (
          <div className="stage-readout">
            <span>{status}</span>
            {at}
          </div>
        )}
        {projection ?? (!horizon && <StoryProjection map={map} onMap={onMap} />)}
      </div>
      {evidence}
      <div className="observatory-sidebar replay-sidebar">
        <StoryDockProvider>
          <div id="observatory-intro" className="observatory-intro observation-panel" tabIndex={-1}>
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
            <SharedStory moment={sharedMoment} />
            {children}
            {sharing && <ShareMoment />}
            {ending && <ExperienceEnding showFinding={finding} showSave={save} />}
            <details className="replay-sources">
              <summary>Sources &amp; coverage</summary>
              <div>{sources}</div>
            </details>
          </div>
        </StoryDockProvider>
      </div>
    </section>
  );
}
