import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { RADAR_SERVICE } from "../../sources/radar";
import type { RadarView } from "./radarCamera";
import "./radar.css";

const RadarStage = lazy(() => import("./RadarStage").then(({ RadarStage }) => ({ default: RadarStage })));

export function RadarReadout(): JSX.Element {
  return (
    <div className="observatory-stage" data-stage="radar" role="group" aria-label="Radar on the globe">
      <div className="stage-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="stage-ident">
        <span className="stage-rule" aria-hidden="true" />
        <span>NOAA MRMS · Base reflectivity</span>
      </div>
      <div className="stage-readout">Contiguous United States</div>
    </div>
  );
}

export function StormRadar({
  fromExplore,
  onClose,
  onView,
}: {
  fromExplore: boolean;
  onClose: () => void;
  onView: (view: RadarView) => void;
}): JSX.Element {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onClose]);

  return (
    <>
      <div className="radar-heading">
        <h2>Storm Radar</h2>
        <div className="observatory-actions radar-actions">
          <button
            type="button"
            ref={back}
            onClick={onClose}
            aria-label={fromExplore ? "Back to Explore" : "Back to Live Earth"}
          >
            Back
          </button>
        </div>
      </div>
      <Suspense fallback={<p role="status">Opening Storm Radar…</p>}>
        <RadarStage onView={onView} />
      </Suspense>
      <div className="radar-sources" aria-label="Storm Radar sources">
        <a href={RADAR_SERVICE} target="_blank" rel="noreferrer" aria-describedby="external-link-hint">
          NOAA MRMS
        </a>
        <a
          href="https://www.weather.gov/jetstream/reflectivity"
          target="_blank"
          rel="noreferrer"
          aria-describedby="external-link-hint"
        >
          What reflectivity means
        </a>
      </div>
    </>
  );
}
