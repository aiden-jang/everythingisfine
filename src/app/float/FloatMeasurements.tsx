import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { TimelineTrack } from "../observations/TimelineTrack";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { MeasurementSound } from "../MeasurementSound";
import { FloatObservation } from "./FloatObservation";
import { FloatChapter } from "./FloatChapter";
import { FloatFinding } from "./FloatFinding";
import { FloatProfile } from "./FloatProfile";
import { profileTakeaway } from "./profileGeometry";
import type { FloatDiveView } from "./floatPlayback";

const meters = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function FloatMeasurements({
  view,
  sound,
  onClose,
}: {
  view: FloatDiveView;
  sound: boolean;
  onClose: () => void;
}) {
  const { index, playing, inspecting, stage } = useSyncExternalStore(view.subscribe, view.read);
  const focusPlayback = useRef(false);
  const transport = useRef<HTMLElement>(null);
  const { samples } = view.profile;
  const entries = useStoryNavigation()?.library.saved;
  const kept = entries?.flatMap(({ position }) =>
    position.float?.profile === view.profile.id ? [position.float.index] : [],
  );
  const sample = samples[index]!;
  const takeaway = useMemo(() => profileTakeaway(samples), [samples]);
  useStoryCompletion(stage === "notice");
  useLayoutEffect(() => {
    const element = transport.current;
    const zones = element?.closest<HTMLElement>(".zones");
    if (!element || !zones) return;
    const measure = () => {
      const bottom = parseFloat(getComputedStyle(element).bottom) || 0;
      zones.style.setProperty("--float-dock-clearance", `${element.offsetHeight + bottom + 16}px`);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    measure();
    return () => {
      resize.disconnect();
      zones.style.removeProperty("--float-dock-clearance");
    };
  }, []);
  useLayoutEffect(() => {
    const intro = document.getElementById("observatory-intro");
    const zones = intro?.closest<HTMLElement>(".zones");
    if (intro) intro.dataset["floatStage"] = stage;
    if (zones) {
      zones.dataset["floatInspecting"] = String(inspecting);
      zones.dataset["floatStage"] = stage;
    }
    if (focusPlayback.current && stage !== "locate") {
      focusPlayback.current = false;
      zones
        ?.querySelector<HTMLButtonElement>(".float-transport .story-playback")
        ?.focus({ preventScroll: true });
    }
    return () => {
      if (intro) delete intro.dataset["floatStage"];
      if (zones) {
        delete zones.dataset["floatInspecting"];
        delete zones.dataset["floatStage"];
      }
    };
  }, [stage, inspecting]);
  useLayoutEffect(() => {
    if (stage !== "notice") return;
    const intro = document.getElementById("observatory-intro");
    const finding = intro?.querySelector<HTMLElement>(".float-takeaway");
    const focused = document.activeElement;
    if (!intro || !finding) return;
    if (intro.contains(focused) && focused?.matches("input, textarea, select, [contenteditable]")) return;
    // Scroll the reading pane alone so the finding cannot move the shared world or its playback deck.
    intro.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [stage, view]);
  return (
    <>
      <FloatChapter
        view={view}
        onBegin={() => {
          focusPlayback.current = true;
          view.toggle();
        }}
      />
      <div className="float-reading">
        <div className="float-depth">
          <span>Estimated depth</span>
          <strong data-float-depth>
            {meters.format(sample.depth)} <span>m</span>
          </strong>
          <small>{sample.pressure.toFixed(1)} dbar</small>
        </div>
        <div className="float-measurements">
          <div className="float-value">
            <span>Temperature</span>
            <strong>{sample.temperature.toFixed(2)} °C</strong>
          </div>
          <div className="float-value">
            <span>Practical salinity</span>
            <strong>{sample.salinity.toFixed(3)}</strong>
          </div>
        </div>
      </div>
      {createPortal(
        <section ref={transport} className="float-transport" role="group" aria-label="Float Dive playback">
          <div className="float-chapters" role="group" aria-label="Float Dive chapters">
            <button type="button" aria-pressed={stage === "locate"} onClick={view.locate}>
              Locate
            </button>
            <button type="button" aria-pressed={stage === "rise"} onClick={view.rise}>
              Rise
            </button>
            <button type="button" aria-pressed={stage === "notice"} onClick={view.notice}>
              Notice
            </button>
          </div>
          <div className="float-playback-row">
            <div className="float-track" data-inspecting={inspecting || undefined}>
              <div className="float-edges">
                <span>{meters.format(samples[0]!.depth)} m</span>
                <span>{meters.format(samples.at(-1)!.depth)} m</span>
              </div>
              {inspecting ? (
                <p className="float-inspection-position">
                  {meters.format(sample.depth)} m · inspect the profile above
                </p>
              ) : (
                <TimelineTrack max={samples.length - 1} current={index} kept={kept}>
                  <input
                    type="range"
                    className="scrub-slider float-scrub"
                    min={0}
                    max={samples.length - 1}
                    value={index}
                    onChange={(event) => view.seek(event.currentTarget.valueAsNumber)}
                    aria-label="Ascent depth"
                    aria-valuetext={`${meters.format(sample.depth)} m`}
                  />
                </TimelineTrack>
              )}
            </div>
            <PlaybackButton playing={playing} ended={index === samples.length - 1} onClick={view.toggle} />
            <button
              type="button"
              className="float-inspect-toggle"
              aria-expanded={inspecting}
              aria-controls={inspecting ? "float-measured-profile" : undefined}
              onClick={() => view.inspect(!inspecting)}
            >
              {inspecting ? "Close profile" : "View measured profile"}
            </button>
          </div>
          <small>Illustrated section · measured samples · depth estimated from pressure</small>
        </section>,
        document.querySelector(".zones")!,
      )}
      <FloatProfile view={view} />
      <p className="sr-only" role="status">
        {stage === "notice" ? `Ascent complete. ${takeaway.finding.heading} ${takeaway.finding.reading}` : ""}
      </p>
      <FloatFinding view={view} onClose={onClose} notice={stage === "notice"}>
        <div hidden={stage === "locate"}>
          <FloatObservation
            view={view}
            sampleIndex={stage === "notice" && !inspecting ? takeaway.finding.index : undefined}
          />
        </div>
      </FloatFinding>
      {sound && (
        <MeasurementSound
          key={view.profile.id}
          value={sample.temperature}
          min={-2}
          max={35}
          label="temperature"
          explanation="Higher pitch means warmer measured water (−2 to 35 °C)."
        />
      )}
    </>
  );
}
