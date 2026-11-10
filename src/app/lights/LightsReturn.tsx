import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  blackMarbleSource,
  lightsPeriods,
  loadBlackMarble,
  mariaStudy,
  puertoRico,
} from "../../sources/observations/blackMarble";
import { ObservationCredit } from "../observations/ObservationCredit";
import type { ObservationView } from "../observations/types";
import { useObservatoryEscape } from "../useObservatoryEscape";

import { ShareMoment, useStorySession } from "../observations/StorySession";

const MOTION = "(prefers-reduced-motion: reduce)";
const LAST = lightsPeriods.length - 1;
const EXIT_MS = 240;
const locator = { at: Date.UTC(2017, 8, 20, 4), marks: [{ ...puertoRico, size: 19, color: 0xe6caa6 }] };

interface Landing {
  scale: number;
  animate: boolean;
}

export function LightsReturn({
  onView,
  onClose,
}: {
  onView: (view: ObservationView) => void;
  onClose: () => void;
}): JSX.Element {
  const { initial, remember } = useStorySession();
  const back = useRef<HTMLButtonElement>(null);
  const archive = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  const exit = useRef<number>();
  const [attempt, retry] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [landing, setLanding] = useState<Landing | null>(null);
  const [index, setIndex] = useState(Math.max(0, Math.min(LAST, Math.round(Number(initial?.choice) || 0))));
  const [playing, setPlaying] = useState(() => !initial && !matchMedia(MOTION).matches);
  const [leaving, setLeaving] = useState(false);
  const [compare, setCompare] = useState(initial?.chapter?.startsWith("compare:") ?? false);
  const [split, setSplit] = useState(
    Math.max(0, Math.min(100, Number(initial?.chapter?.split(":")[1] ?? 50) || 0)),
  );
  const timeline = useId();
  const compareId = useId();
  const frame = lightsPeriods[index]!;
  const displayed = compare && split === 100 ? lightsPeriods[0] : frame;

  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), []);
  useEffect(() => () => window.clearTimeout(exit.current), []);
  useEffect(() => {
    let open = true;
    void loadBlackMarble().then(
      () => open && setStatus("ready"),
      () => open && setStatus("error"),
    );
    return () => {
      open = false;
    };
  }, [attempt]);

  const arrive = useCallback((scale: number, reduced: boolean) => {
    if (document.activeElement === skip.current) play.current?.focus({ preventScroll: true });
    setLanding((current) => current ?? { scale, animate: !reduced });
    if (reduced) setPlaying(false);
  }, []);
  useLayoutEffect(() => {
    if (status === "ready")
      onView({
        kind: "observation",
        target: puertoRico,
        frame: locator,
        image: null,
        capture: false,
        arrive,
      });
    remember?.({ choice: String(index), chapter: compare ? `compare:${split}` : "" });
  }, [status, onView, arrive, remember, index, compare, split]);

  useEffect(() => {
    if (!landing || !playing || index === LAST) return;
    let timer = 0;
    function start() {
      window.clearTimeout(timer);
      if (document.hidden) return;
      timer = window.setTimeout(
        () => {
          setIndex(index + 1);
          if (index + 1 === LAST) setPlaying(false);
        },
        index === 0 ? 2200 : 1800,
      );
    }
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [landing, index, playing]);
  useEffect(() => {
    const preference = matchMedia(MOTION);
    const change = () => {
      if (preference.matches) setPlaying(false);
    };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);

  function close() {
    if (exit.current !== undefined) return;
    if (!archive.current || matchMedia(MOTION).matches || document.hidden) {
      onClose();
      return;
    }
    setPlaying(false);
    setLeaving(true);
    // A throttled compositor can leave an exit animation's completion promise pending.
    exit.current = window.setTimeout(onClose, EXIT_MS);
  }
  useObservatoryEscape(close);

  return (
    <>
      <div
        className="observatory-stage lights-stage"
        data-stage="lights"
        role="group"
        aria-label="Puerto Rico night lights"
      >
        {landing && (
          <div
            className="lights-archive"
            ref={archive}
            data-arrived=""
            data-animate={landing.animate || undefined}
            data-playing={playing || undefined}
            data-leaving={leaving || undefined}
          >
            <div
              className="lights-map"
              style={
                { "--lights-entry-scale": landing.scale, "--lights-split": `${split}%` } as CSSProperties
              }
            >
              {lightsPeriods.map((period, i) => (
                <img
                  key={period.image}
                  src={period.image}
                  alt=""
                  data-current={i === index || undefined}
                  width="1840"
                  height="863"
                />
              ))}
              {compare && (
                <>
                  <img
                    className="lights-baseline"
                    src={lightsPeriods[0].image}
                    alt=""
                    width="1840"
                    height="863"
                  />
                  {split > 0 && split < 100 && <div className="lights-divider" aria-hidden="true" />}
                </>
              )}
              <div className="lights-place lights-san-juan" aria-hidden="true">
                San Juan
              </div>
              <div className="lights-place lights-ponce" aria-hidden="true">
                Ponce
              </div>
              <div className="lights-place lights-mayaguez" aria-hidden="true">
                Mayagüez
              </div>
            </div>
            <div className="lights-key" aria-label="Relative nighttime light intensity">
              <span>Dimmer</span>
              <i aria-hidden="true" data-ramp="" />
              <span>Brighter</span>
            </div>
          </div>
        )}
        <div className="stage-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="stage-ident">
          <span className="stage-rule" aria-hidden="true" />
          <span>{landing ? "Puerto Rico · Black Marble" : "After Dark · Puerto Rico"}</span>
        </div>
        <div className="stage-readout lights-readout">
          {compare && split > 0 && split < 100 ? (
            <>
              <span>Left · Before Maria</span>
              <span>Right · {frame.title}</span>
            </>
          ) : (
            <>
              <span>
                {landing
                  ? displayed.title
                  : status === "ready"
                    ? "Approaching the island"
                    : "Satellite archive"}
              </span>
              {landing && <span>{displayed.dates}</span>}
            </>
          )}
        </div>
      </div>
      <div className="observatory-sidebar">
        <section
          id="observatory-intro"
          className="observatory-intro observation-panel lights-panel"
          aria-labelledby="lights-title"
          tabIndex={-1}
        >
          <div className="observation-heading">
            <h2 id="lights-title">Lights Return</h2>
            <div className="observatory-actions">
              <button type="button" onClick={close} ref={back}>
                Back to After Dark
              </button>
            </div>
          </div>
          {status === "loading" && (
            <p className="observation-note" role="status">
              Loading NASA’s night-light archive…
            </p>
          )}
          {status === "error" && (
            <>
              <p className="observation-note" role="status" aria-label="Image loading status">
                NASA’s archived images couldn’t load.
              </p>
              <div className="observatory-actions">
                <button
                  type="button"
                  onClick={() => {
                    setStatus("loading");
                    retry(attempt + 1);
                  }}
                >
                  Retry images
                </button>
              </div>
            </>
          )}
          {status === "ready" && (
            <>
              <div className="observatory-actions lights-actions">
                {!landing && (
                  <button
                    type="button"
                    ref={skip}
                    onClick={() => {
                      play.current?.focus({ preventScroll: true });
                      setLanding({ scale: 1, animate: false });
                    }}
                  >
                    Skip approach
                  </button>
                )}
                <button
                  type="button"
                  ref={play}
                  onClick={() => {
                    if (playing) setPlaying(false);
                    else {
                      if (index === LAST) setIndex(0);
                      setCompare(false);
                      setPlaying(true);
                    }
                  }}
                >
                  {playing ? "Pause replay" : index === LAST ? "Replay recovery" : "Play recovery"}
                </button>
                <button
                  type="button"
                  aria-pressed={compare}
                  disabled={!landing || index === 0}
                  onClick={() => {
                    setPlaying(false);
                    setCompare(!compare);
                  }}
                >
                  Compare with before
                </button>
              </div>
              <div className="lights-timeline">
                <div className="lights-row">
                  <label htmlFor={timeline}>Night-light period</label>
                  <span>{frame.dates}</span>
                </div>
                <input
                  id={timeline}
                  className="scrub-slider"
                  type="range"
                  min={0}
                  max={LAST}
                  value={index}
                  aria-valuetext={`${frame.title} · ${frame.dates}`}
                  onChange={(event) => {
                    const selected = event.currentTarget.valueAsNumber;
                    if (!landing) arrive(1, true);
                    setPlaying(false);
                    setIndex(selected);
                    if (selected === 0) setCompare(false);
                  }}
                />
              </div>
              {compare && (
                <div className="lights-timeline">
                  <div className="lights-row">
                    <label htmlFor={compareId}>Before and after divider</label>
                    <span>{split}% from left</span>
                  </div>
                  <input
                    id={compareId}
                    className="scrub-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={split}
                    aria-valuetext={`${split}% from left`}
                    onChange={(event) => setSplit(event.currentTarget.valueAsNumber)}
                  />
                </div>
              )}
              <p className="observation-note lights-frame-note">
                <strong>{frame.title}.</strong> {frame.note}
              </p>
            </>
          )}
          <p className="observation-note lights-context">
            Hurricane Maria made landfall near Yabucoa on 20 September 2017. NASA’s nighttime observations
            trace the uneven return of light.
          </p>
          <details className="lights-sources">
            <summary>Data and interpretation</summary>
            <p className="observation-note">
              These are Black Marble HD images from NASA’s Scientific Visualization Studio. The three
              post-storm views average multiple nights. Brightness indicates light detected from orbit, a
              proxy for recovery that cannot establish which homes had electricity.
            </p>
            <div className="lights-links">
              <a href={blackMarbleSource} target="_blank" rel="noreferrer">
                NASA Black Marble HD
              </a>
              <a href={mariaStudy} target="_blank" rel="noreferrer">
                Recovery study
              </a>
              <a href="https://www.nhc.noaa.gov/data/tcr/AL152017_Maria.pdf" target="_blank" rel="noreferrer">
                NOAA landfall record
              </a>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                © OpenStreetMap contributors
              </a>
            </div>
          </details>
          <ShareMoment />
        </section>
        <ObservationCredit />
      </div>
    </>
  );
}
