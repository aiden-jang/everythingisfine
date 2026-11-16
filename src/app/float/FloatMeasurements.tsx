import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { MeasurementSound } from "../MeasurementSound";
import { FloatObservation } from "./FloatObservation";
import { FloatProfile } from "./FloatProfile";
import { profileTakeaway } from "./profileGeometry";
import type { FloatDiveView } from "./floatPlayback";

const meters = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function FloatMeasurements({ view, sound }: { view: FloatDiveView; sound: boolean }) {
  const { index, playing, inspecting, stage } = useSyncExternalStore(view.subscribe, view.read);
  const { samples } = view.profile;
  const sample = samples[index]!;
  const takeaway = useMemo(() => profileTakeaway(samples), [samples]);
  useStoryCompletion(stage === "notice");
  useLayoutEffect(() => {
    const intro = document.getElementById("observatory-intro");
    const zones = intro?.closest<HTMLElement>(".zones");
    if (intro) intro.dataset["floatStage"] = stage;
    if (zones) zones.dataset["floatInspecting"] = String(inspecting);
    return () => {
      if (intro) delete intro.dataset["floatStage"];
      if (zones) delete zones.dataset["floatInspecting"];
    };
  }, [stage, inspecting]);
  useLayoutEffect(() => {
    if (stage !== "notice") return;
    const intro = document.getElementById("observatory-intro");
    const finding = intro?.querySelector<HTMLElement>(".float-takeaway");
    const focused = document.activeElement;
    if (!intro || !finding) return;
    if (intro.contains(focused) && focused?.matches("input, textarea, select, [contenteditable]")) return;
    const panel = intro.getBoundingClientRect();
    const result = finding.getBoundingClientRect();
    // Scroll the reading pane alone so the finding cannot move the shared world or its playback deck.
    intro.scrollTo({
      top: intro.scrollTop + result.top - panel.top - 16,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [stage, view]);
  return (
    <>
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
        <section className="float-transport" role="group" aria-label="Float Dive playback">
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
            <PlaybackButton playing={playing} ended={index === samples.length - 1} onClick={view.toggle} />
            <div className="float-track">
              <div className="float-edges">
                <span>{meters.format(samples[0]!.depth)} m</span>
                <span>{meters.format(samples.at(-1)!.depth)} m</span>
              </div>
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
            </div>
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
          <small>Ascent compressed for playback · depth estimated from pressure</small>
        </section>,
        document.querySelector(".zones")!,
      )}
      <FloatProfile view={view} />
      <p className="sr-only" role="status">
        {stage === "notice" ? `Ascent complete. ${takeaway.finding.heading} ${takeaway.finding.reading}` : ""}
      </p>
      {stage === "notice" && (
        <section className="float-takeaway" aria-label="What this profile showed">
          <h3>{takeaway.finding.heading}</h3>
          <p>{takeaway.finding.reading}</p>
          <button
            type="button"
            onClick={() => {
              view.seek(takeaway.finding.index);
              view.inspect(true);
            }}
          >
            Inspect this sample
          </button>
          <small>{samples.length.toLocaleString()} measured samples. One location and one date.</small>
        </section>
      )}
      <FloatObservation view={view} />
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
