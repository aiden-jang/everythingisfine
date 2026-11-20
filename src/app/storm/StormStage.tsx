import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { gulf, stormGeography, stormLens, stormTarget } from "./stormGlobe";
import { useObservationImage } from "../observations/useObservationData";
import {
  FIXES,
  FLIGHT_MS,
  START,
  SURVEY_MS,
  TRACK_MINUTES,
  stormCategory,
  stormClock,
  stormFrame,
} from "./stormTrack";

import { useStorySession } from "../observations/StorySession";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { savedVisitKey } from "../visitor/library";
import terra from "./terra-2005-08-28.webp?url";
import { StormFinding, StormInvitation } from "./StormNarrative";
import { StormTransport } from "./StormTransport";

const comparisonTarget = { ...stormTarget, lat: 26.55 };
const comparisonLens = { globe: stormLens.globe, map: 8.2 };
const MOTION = "(prefers-reduced-motion: reduce)";

interface Playback {
  elapsed: number;
  survey: boolean;
  playing: boolean;
  phase: "intro" | "follow" | "inspect" | "compare";
}

function seekTo(minute: number): Playback {
  return { elapsed: (minute / TRACK_MINUTES) * SURVEY_MS, survey: true, playing: false, phase: "inspect" };
}

const fixedComparison = (minute: number): Playback => ({ ...seekTo(minute), phase: "compare" });

function initialPlayback(at: number, compare: boolean) {
  const minute = Math.max(0, Math.min(TRACK_MINUTES, (at - START) / 60_000));
  const fix = FIXES.reduce((closest, candidate) =>
    Math.abs(at - candidate.time) < Math.abs(at - closest.time) ? candidate : closest,
  );
  return compare ? fixedComparison((fix.time - START) / 60_000) : seekTo(minute);
}

const duration = (playback: Playback) => (playback.survey ? SURVEY_MS : FLIGHT_MS);

export function StormStage({ onView, ...panel }: ReplayProps): JSX.Element {
  const { initial, remember } = useStorySession();
  const navigation = useStoryNavigation();
  const [view, setView] = useState<Playback>(() =>
    initial
      ? initialPlayback(initial.at ?? START, initial.chapter === "compare")
      : { elapsed: 0, survey: matchMedia(MOTION).matches, playing: false, phase: "intro" },
  );
  const clock = useRef(view);
  const playback = useRef<HTMLButtonElement>(null);
  const reading = useRef<HTMLHeadingElement>(null);
  const replayPoint = useRef<Playback | null>(null);
  const [archiveReady, setArchiveReady] = useState(false);
  const { element: coast } = useObservationImage(gulf.url);
  const [ready, setReady] = useState(false);
  const arrive = useCallback(() => setReady(true), []);

  const update = useCallback((next: Playback) => {
    clock.current = next;
    setView(next);
  }, []);

  useEffect(() => {
    if (!view.playing || !ready) return;
    let previous: number | undefined;
    let lastReadout = 0;
    let request = 0;
    function tick(now: number) {
      const current = clock.current;
      if (!current.playing) return;
      const dt = previous === undefined ? 0 : now - previous;
      previous = now;
      const elapsed = Math.min(duration(current), current.elapsed + dt);
      const next =
        elapsed >= duration(current)
          ? fixedComparison(TRACK_MINUTES)
          : { ...current, elapsed, playing: true };
      clock.current = next;
      if (!next.playing) replayPoint.current = seekTo(TRACK_MINUTES);
      if (!next.playing || now - lastReadout >= 75) {
        setView(next);
        lastReadout = now;
      }
      if (next.playing) request = requestAnimationFrame(tick);
    }
    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden) request = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [view.playing, ready]);

  useEffect(() => {
    const motion = matchMedia(MOTION);
    function change(event: MediaQueryListEvent) {
      if (!event.matches || clock.current.survey) return;
      const at = stormFrame(clock.current.elapsed, false).storm.at;
      update({ ...seekTo((at - START) / 60_000), phase: clock.current.phase });
    }
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, [update]);

  const comparing = view.phase === "compare";
  const invited = view.phase === "intro";
  const compareAt = useCallback(
    (minute: number) => {
      if (!comparing) replayPoint.current = invited ? seekTo(0) : { ...clock.current, playing: false };
      update(fixedComparison(minute));
      if (!comparing) requestAnimationFrame(() => reading.current?.focus({ preventScroll: true }));
    },
    [comparing, invited, update],
  );

  const inspectFix = useCallback(
    (index: number) => {
      compareAt((FIXES[index]!.time - START) / 60_000);
    },
    [compareAt],
  );
  const archiveOpacity =
    !panel.map && archiveReady && !initial && (view.phase === "intro" || !view.survey)
      ? Math.max(0, 1 - view.elapsed / 1600)
      : 0;
  const visibleArchive = archiveOpacity > 0;
  useLayoutEffect(() => {
    const frame = stormFrame(view.elapsed, view.survey);
    onView({
      kind: "observation",
      ...stormGeography(frame, !view.survey, comparing),
      capture: !visibleArchive,
      image: coast,
      target: comparing ? comparisonTarget : stormTarget,
      lens: comparing ? comparisonLens : stormLens,
      arrive,
      pickMarks: invited || visibleArchive ? undefined : { points: FIXES, select: inspectFix },
    });
    remember?.({ chapter: comparing ? "compare" : "" });
  }, [view, onView, arrive, coast, comparing, remember, visibleArchive, invited, inspectFix]);
  const storm = stormFrame(view.elapsed, view.survey).storm;
  const { fix } = storm;
  const minute = Math.floor((storm.at - START) / 60_000);
  const ended = view.elapsed >= duration(view);
  const kept =
    comparing && navigation?.library.saved.some((entry) => savedVisitKey(entry) === `katrina:${fix.time}`);
  const title = fix.landfall
    ? "Landfall near Buras, Louisiana"
    : fix.wind === 150
      ? "Peak offshore intensity"
      : "Across the Gulf";
  const progress = stormClock(storm.at);
  useStoryCompletion(comparing);
  const atFix = storm.at === fix.time;

  function toggle() {
    const current = clock.current;
    if (current.playing) update({ ...current, playing: false });
    else if (current.phase === "compare" || current.elapsed >= duration(current)) {
      update({ elapsed: 0, playing: true, survey: matchMedia(MOTION).matches, phase: "follow" });
    } else update({ ...current, playing: true });
  }

  function follow() {
    update(
      matchMedia(MOTION).matches
        ? fixedComparison(TRACK_MINUTES)
        : { elapsed: 0, survey: false, playing: true, phase: "follow" },
    );
    requestAnimationFrame(() => playback.current?.focus({ preventScroll: true }));
  }

  const readings = (
    <div className="archive-scene-caption storm-reading">
      <h3 ref={reading} tabIndex={-1}>
        {title}
      </h3>
      <p
        className="storm-measurements"
        aria-live={comparing ? "polite" : undefined}
        aria-atomic={comparing || undefined}
      >
        <span>
          <strong>{fix.wind} kt</strong> max wind
        </span>
        <span>
          <strong>{fix.pressure} hPa</strong> central pressure
        </span>
      </p>
      <p>
        Category {stormCategory(fix.wind)} · {atFix ? "Recorded position" : "Last recorded position"}{" "}
        <time dateTime={fix.at}>{stormClock(fix.time)}</time>
      </p>
    </div>
  );
  const comparisonActions = (
    <div className="observatory-actions storm-keep-actions">
      {navigation && (
        <button
          type="button"
          disabled={kept}
          className="storm-keep"
          onClick={() => {
            const selected = navigation.current();
            if (selected) navigation.library.save(selected);
          }}
        >
          {kept ? "Fix kept" : "Keep this fix"}
        </button>
      )}
      <button type="button" onClick={() => update(replayPoint.current ?? seekTo(minute))}>
        Back to replay
      </button>
      {navigation?.library.notice && (
        <p className="observation-note" role="status">
          {navigation.library.notice}
        </p>
      )}
    </div>
  );

  return (
    <ReplayPanel
      {...panel}
      finding={false}
      save={!comparing}
      className="storm-journey"
      title="Eye of the Storm"
      location="Gulf of Mexico"
      subtitle="Hurricane Katrina · NOAA best track · 28–29 Aug 2005"
      status={
        visibleArchive
          ? "NASA Terra MODIS · 28 Aug 2005 · 17:00 UTC"
          : invited || comparing
            ? "NOAA best track"
            : view.survey || ended
              ? "Track overview"
              : "Camera follows storm center"
      }
      inset={
        <>
          {!initial && (
            <img
              className="storm-archive"
              src={terra}
              alt=""
              aria-hidden="true"
              onLoad={() => setArchiveReady(true)}
              style={{ opacity: archiveOpacity, scale: 1 + (1 - archiveOpacity) * 0.07 }}
              hidden={archiveReady && !visibleArchive}
            />
          )}
          {comparing && (
            <div className="storm-map-labels" aria-hidden="true">
              <span
                data-observation-anchor=""
                data-storm-fix={storm.fixIndex}
                data-lon={fix.lon}
                data-lat={fix.lat}
              >
                {fix.wind} kt · {fix.pressure} hPa
              </span>
            </div>
          )}
        </>
      }
      at={
        !visibleArchive && (
          <time dateTime={new Date(storm.at).toISOString()}>
            <small>{progress.split(" · ")[0]}</small> {progress.split(" · ")[1]}
          </time>
        )
      }
      sources={
        <>
          <a href="https://www.nhc.noaa.gov/data/" target="_blank" rel="noreferrer">
            NOAA HURDAT2
          </a>
          <a href="https://www.nhc.noaa.gov/data/tcr/AL122005_Katrina.pdf" target="_blank" rel="noreferrer">
            NHC Katrina report
          </a>
          <a
            href="https://science.nasa.gov/earth/earth-observatory/hurricane-katrina-15395/"
            target="_blank"
            rel="noreferrer"
          >
            NASA Earth Observatory · Terra MODIS
          </a>
          <span>Coastlines by Natural Earth</span>
        </>
      }
    >
      {invited ? (
        <StormInvitation onFollow={follow} onInspect={() => inspectFix(0)} />
      ) : (
        <div className="archive-scene-console" data-storm-phase={comparing ? "compare" : view.phase}>
          {comparing ? (
            <StormFinding
              selected={storm.fixIndex}
              onInspect={compareAt}
              readings={readings}
              actions={comparisonActions}
            />
          ) : (
            readings
          )}
          <StormTransport
            at={storm.at}
            minute={minute}
            fixIndex={storm.fixIndex}
            comparing={comparing}
            playing={view.playing}
            ended={ended}
            buttonRef={playback}
            onSeek={(value) => (comparing ? inspectFix(value) : update(seekTo(value)))}
            onInspect={compareAt}
            onToggle={toggle}
          />
          <p className="storm-legend">
            {fix.landfall ? (
              "Wind extent unavailable for this position."
            ) : (
              <>
                <span>
                  <i className="storm-extent" aria-hidden="true" />
                  34 kt radius
                </span>
                <span>
                  <i className="storm-extent storm-extent-strong" aria-hidden="true" />
                  64 kt radius
                </span>
                {!atFix && <span>Center and radii interpolated.</span>}
              </>
            )}
          </p>
        </div>
      )}
    </ReplayPanel>
  );
}
