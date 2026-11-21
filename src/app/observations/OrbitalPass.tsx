import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { aimAt } from "../../geo/tonight";
import { orbit } from "../../sources/observations/orbit";

import { PlaybackButton } from "../PlaybackButton";
import { useJourneyGestures } from "../journeyCamera";
import { useReportStorySource } from "./StorySourceStatus";
import { SkyCityPicker, type SkyCityPreference } from "../tonight/SkyCityPicker";
import { StoryLoading } from "../StoryLoading";
import { useStoryClock } from "../earth-stories/useStoryClock";
import { ReplayPanel, type ReplayProps } from "./RecordedReplay";
import { observations } from "./catalogue";
import { StoryDock } from "./StoryDock";
import { StoryProjection } from "./StoryProjection";
import { useStorySession } from "./StorySession";
import { TimelineCues } from "./TimelineCues";
import { useObservationData } from "./useObservationData";
import { useSkyReturn } from "./useSkyReturn";
import type { ObservationData, ObservationView } from "./types";

const meta = observations.orbit;
const minute = 60_000;
const passClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const passTime = (at: number) => `${passClock.format(at)} UTC`;
const nearest = (data: ObservationData, at: number) =>
  data.frames.reduce(
    (best, frame, i) => (Math.abs(frame.at - at) < Math.abs(data.frames[best]!.at - at) ? i : best),
    0,
  );

export function OrbitalPass({ city, ...panel }: ReplayProps & { city: SkyCityPreference }) {
  const source = useObservationData(orbit, city.name);
  const { initial } = useStorySession();
  useReportStorySource("orbit", source.state, source.retry);
  if (source.data)
    return <PassPlayer key={city.name} {...panel} city={city} data={source.data} source={source} />;

  return (
    <ReplayPanel
      {...panel}
      title={meta.title}
      location={city.name}
      subtitle={meta.description}
      status={null}
      sources={<OrbitSource />}
      ending={false}
      sharing={false}
    >
      <SkyCityPicker city={city.name} select={city.select} />
      {source.state === "loading" ? (
        <StoryLoading>Calculating the ISS track for {city.name}…</StoryLoading>
      ) : (
        <div className="observation-note" role="status">
          <p>{source.reason ?? (source.state === "empty" ? meta.empty : "CelesTrak is unavailable.")}</p>
          <button type="button" onClick={source.retry}>
            Retry source
          </button>
        </div>
      )}
      {initial?.at !== undefined && <p className="observation-note">Waiting for current orbital elements.</p>}
    </ReplayPanel>
  );
}

function OrbitSource({ note }: { note?: string }) {
  return (
    <>
      {note && <p>{note}</p>}
      <a href={meta.url} target="_blank" rel="noreferrer">
        CelesTrak · ISS orbital elements
      </a>
      <p>Estimated in 30-second steps. Visibility requires a sunlit ISS above 10° and the Sun below −6°.</p>
    </>
  );
}

function PassPlayer({
  data,
  city,
  source,
  onView,
  ...panel
}: ReplayProps & {
  data: ObservationData;
  city: SkyCityPreference;
  source: ReturnType<typeof useObservationData>;
}) {
  const { initial, remember } = useStorySession();
  const { onMap } = panel;
  const [horizon, setHorizon] = useState(initial?.chapter === "horizon" && !panel.map);
  const [watching, setWatching] = useState(false);
  const [ready, setReady] = useState(false);
  const [skyReady, setSkyReady] = useState(false);
  const [start] = useState(() => (initial?.at !== undefined ? nearest(data, initial.at) : 0));
  const waiting = useRef(true);
  const skyReturn = useSkyReturn(panel);
  const { frames, visiblePass: pass } = data;
  const appearance = pass ? nearest(data, pass.appearance) : -1;
  const disappearance = pass ? nearest(data, pass.disappearance) : -1;
  const lead = Math.max(0, appearance - 9);
  const horizonEntry = Math.max(0, appearance - 2);
  const last = Math.min(frames.length - 1, disappearance + 1);
  const passRate = 22_000 / ((frames.length - 1) * 550);
  const pace = useCallback(
    (position: number) => (watching && position >= lead - 1 && position <= last + 1 ? passRate : 1),
    [watching, lead, last, passRate],
  );
  const clock = useStoryClock(frames.length, start, waiting, !!initial?.at, false, 22_000, pace);
  const index = Math.floor(clock.position);
  const frame = frames[index] ?? frames[0]!;
  const time = passTime(frame.at);
  const arrive = useCallback(() => setReady(true), []);
  const arriveSky = useCallback(() => setSkyReady(true), []);
  const inSky = horizon && !panel.map;
  waiting.current = inSky ? watching && !skyReady : !ready;
  const trail = useMemo(
    () => frames.slice(appearance, disappearance).map((item) => item.localSky!.look),
    [frames, appearance, disappearance],
  );
  const sky = useMemo((): ObservationView["sky"] => {
    if (!inSky || !frame.localSky) return undefined;
    const { city, look, visible } = frame.localSky;
    const imminent = watching && pass && frame.at < pass.appearance;
    const aim = imminent ? frames[appearance]!.localSky!.look : look;
    return {
      kind: "tonight",
      city,
      at: frame.at,
      look: aimAt(aim),
      targetName: "ISS",
      bodies: visible ? [{ ...look, name: "ISS", magnitude: -1, lit: null }] : [],
      ...(trail.length ? { nightTrail: { points: trail, following: true } } : {}),
    };
  }, [inSky, frame, trail, watching, pass, frames, appearance]);
  const skyTarget = useMemo(() => ({ ...data.target, zoom: 1.35 }), [data.target]);
  const target = inSky ? skyTarget : ((panel.map ? data.mapTarget : undefined) ?? data.target);
  useLayoutEffect(() => {
    onView({
      kind: "observation",
      frame: inSky ? { at: frame.at } : frame,
      image: null,
      target,
      sky,
      arrive: inSky ? arriveSky : arrive,
      ...(watching && !inSky ? { follow: target } : {}),
    });
    remember?.({ at: frame.at, city: city.name, chapter: inSky ? "horizon" : "" });
  }, [arrive, arriveSky, city.name, frame, inSky, onView, remember, sky, target, watching]);

  const pause = () => {
    clock.pause();
    setWatching(false);
  };
  useJourneyGestures(pause, clock.resume, index < frames.length - 1);

  useLayoutEffect(() => {
    if (!watching) return;
    if (!clock.playing) {
      setWatching(false);
      return;
    }
    if (!inSky && index >= horizonEntry) {
      setSkyReady(false);
      onMap(false);
      setHorizon(true);
    }
    if (index >= last) {
      clock.seek(last);
      setWatching(false);
    }
  }, [watching, clock, inSky, index, horizonEntry, last, onMap]);

  const toEarth = (projection?: boolean) => {
    pause();
    setHorizon(false);
    skyReturn.leave((at) => clock.seek(nearest(data, at)), projection);
  };
  const seek = (selected: number) => {
    setWatching(false);
    clock.seek(selected);
  };
  const watch = () => {
    if (!pass) return;
    if (!inSky) skyReturn.capture(frame.at);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (inSky || reduced) {
      setWatching(!reduced);
      onMap(false);
      setHorizon(true);
      clock.playFrom(appearance);
    } else {
      setWatching(true);
      clock.playFrom(lead);
    }
  };
  const cues = pass
    ? [
        { index: appearance, label: "Appearance" },
        { index: nearest(data, pass.peak), label: "Peak altitude" },
        { index: disappearance, label: "Disappearance" },
      ]
    : (data.chapters ?? []);
  const status = !inSky
    ? "Predicted ground track"
    : frame.localSky?.visible
      ? "ISS above the horizon and sunlit"
      : !pass
        ? "No visible pass in the next 48 hours"
        : frame.at < pass.appearance
          ? "Before the predicted appearance"
          : "Outside the visible pass window";

  return (
    <ReplayPanel
      {...panel}
      className="celestial-journey orbital-pass"
      horizon={inSky}
      title={meta.title}
      location={inSky ? `Local sky · ${city.name}` : city.name}
      subtitle={meta.description}
      status={status}
      sources={<OrbitSource note={data.note} />}
      inset={
        inSky && (
          <div className="iss-sky">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path data-sky-arc="" />
            </svg>
            <div className="tonight-labels" data-sky-labels="" aria-hidden="true">
              <span data-body="ISS">ISS</span>
            </div>
          </div>
        )
      }
      projection={
        <StoryProjection
          map={panel.map}
          globeActive={!inSky && !panel.map}
          onMap={(map) => (inSky ? toEarth(map) : onMap(map))}
        >
          <button
            type="button"
            ref={skyReturn.action}
            onClick={() => {
              if (inSky) toEarth();
              else {
                pause();
                skyReturn.capture(frame.at);
                onMap(false);
                setHorizon(true);
              }
            }}
          >
            {inSky ? "Back to Earth" : "Local sky"}
          </button>
        </StoryProjection>
      }
    >
      <SkyCityPicker
        city={city.name}
        select={(name) => {
          pause();
          skyReturn.reset();
          city.select(name);
        }}
      />
      {initial?.at !== undefined && index === start && frame.at !== initial.at && (
        <p className="observation-note" role="status">
          That saved time is outside the current prediction. Showing the nearest available time.
        </p>
      )}
      {source.state === "failed" && (
        <p className="observation-note" role="status">
          Couldn’t refresh CelesTrak. Showing the last calculation.{" "}
          <button type="button" onClick={source.retry}>
            Retry source
          </button>
        </p>
      )}
      {pass ? (
        <>
          <div className="observatory-actions">
            <button
              type="button"
              className="iss-watch"
              disabled={watching || source.state === "failed"}
              onClick={watch}
            >
              Watch the next pass
            </button>
          </div>
          <p className="observation-note">
            Visible from {passTime(pass.appearance)} for about{" "}
            {(pass.disappearance - pass.appearance) / minute} min.
          </p>
        </>
      ) : (
        <p className="observation-note">No visible pass found in the next 48 hours for {city.name}.</p>
      )}
      <StoryDock>
        <div className="story-time">
          <label htmlFor="iss-pass-time">{meta.time}</label>
          <time dateTime={new Date(frame.at).toISOString()}>{time}</time>
          <div className="story-scrub">
            <input
              id="iss-pass-time"
              className="scrub-slider"
              type="range"
              min={0}
              max={frames.length - 1}
              value={index}
              aria-valuetext={time}
              onInput={(event) => seek(event.currentTarget.valueAsNumber)}
            />
            <TimelineCues cues={cues} index={index} max={frames.length - 1} />
          </div>
        </div>
        <div className="observatory-actions">
          <PlaybackButton
            playing={clock.playing}
            ended={index === frames.length - 1}
            onClick={() => {
              setWatching(false);
              clock.toggle();
            }}
          />
        </div>
      </StoryDock>
      {cues.length > 0 && (
        <div className="story-milestones" role="group" aria-label="Pass moments">
          {cues.map((cue) => (
            <button
              type="button"
              key={cue.label}
              aria-pressed={cue.index === index}
              onClick={() => seek(cue.index)}
            >
              <strong>{cue.label}</strong>
              <small>{passTime(frames[cue.index]!.at)}</small>
            </button>
          ))}
        </div>
      )}
      <dl className="observation-values">
        {frame.measurements?.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </ReplayPanel>
  );
}
