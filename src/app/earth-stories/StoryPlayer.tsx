import { nearestFrame } from "./nearestFrame";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useObservationImage } from "../observations/useObservationData";
import { ObservationChart } from "../observations/ObservationChart";
import { useStorySession } from "../observations/StorySession";
import { type SkyCityPreference } from "../tonight/SkyCityPicker";
import { earthStories, type EarthStoryId } from "./catalogue";
import { asset, type EarthStoryData } from "./types";
import { useStoryClock } from "./useStoryClock";
import { storyCamera } from "./motion";
import transect from "../../sources/earth-stories/dust-transect.json";
import { point } from "./types";
import { StoryOverlay } from "./StoryOverlay";
import { StoryCompass } from "./StoryCompass";
import { StoryChoices } from "./StoryChoices";
import { StorySources } from "./StorySources";
import { useTerrainSection } from "./useTerrainSection";

const dustPoints = transect.points.map(point);
const dustTarget = { lon: -84, lat: 22, zoom: 1.8 };
const format = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });

type Props = ReplayProps & { id: EarthStoryId; city: SkyCityPreference; onRadar: () => void };

export function StoryPlayer({
  data,
  choice,
  displayedChoice,
  setChoice,
  busy,
  failed,
  retry,
  city,
  id,
  onView,
  onRadar,
  ...panel
}: Props & {
  data: EarthStoryData;
  choice: string;
  displayedChoice: string;
  setChoice: (value: string) => void;
  busy: boolean;
  failed: boolean;
  retry: () => void;
}): JSX.Element {
  const meta = earthStories[id];
  const { initial, remember } = useStorySession();
  const [ready, setReady] = useState(false);
  const [skyMode, setSkyMode] = useState(initial?.chapter === "sky");
  const [slice, setSlice] = useState(initial?.chapter === "slice");
  const [site, setSite] = useState(initial?.chapter?.startsWith("site:") ? initial.chapter.slice(5) : "");
  const arrive = useCallback(() => setReady(true), []);
  let restoredAt = initial?.at;
  if ((id === "ozone" || id === "spring") && restoredAt !== undefined)
    restoredAt = Date.parse(
      `${new Date(data.frames[0]!.at).getUTCFullYear()}${new Date(restoredAt).toISOString().slice(4)}`,
    );
  const [start] = useState(() => nearestFrame(data, restoredAt));
  const selected = data.sites?.find((p) => p.id === site);
  const waiting = useRef(true);
  const clock = useStoryClock(data.frames.length, start, waiting, !!initial);
  const index = Math.min(data.frames.length - 1, Math.floor(clock.position));
  const current = data.frames[index]!;
  const requested = useMemo(() => data.geometry?.(current) ?? current, [data, current]);
  const image = useObservationImage(requested.raster?.url, id);
  const lunarImage = useObservationImage(data.lunarImage);
  const curtainImage = useObservationImage(
    requested.section?.image ?? (id === "dust" && slice ? asset(transect.image) : undefined),
    `${id}:section`,
  );
  const holding = useRef({ frame: requested, element: image.element, caption: current.caption });
  if (
    (!requested.raster || image.status === "ready") &&
    (!requested.section || curtainImage.status === "ready")
  )
    holding.current = { frame: requested, element: image.element, caption: current.caption };
  const { frame, element, caption } = holding.current;
  const section = useTerrainSection(data.terrain, initial?.chapter, () => {
    clock.pause();
    panel.onMap(true);
  });
  const viewFrame = useMemo(
    () =>
      data.terrain
        ? {
            ...frame,
            paths: [...(frame.paths ?? []), ...section.paths],
            marks: [...(frame.marks ?? []), ...section.marks],
          }
        : frame,
    [data.terrain, frame, section.paths, section.marks],
  );
  const status =
    image.status !== "ready"
      ? image.status
      : curtainImage.status !== "ready"
        ? curtainImage.status
        : lunarImage.status;
  waiting.current = busy || !ready || status === "loading" || status === "failed";
  const target = useMemo(
    () =>
      id === "dust" && slice
        ? dustTarget
        : selected
          ? { ...data.target, lon: selected.lon, lat: selected.lat }
          : panel.map && data.mapTarget
            ? data.mapTarget
            : data.target,
    [selected, data.target, data.mapTarget, panel.map, id, slice],
  );
  const localSky = useMemo(
    () => (skyMode && !panel.map ? data.sky?.(frame.at) : undefined),
    [skyMode, panel.map, data, frame.at],
  );
  const time = frame.timeLabel ?? format.format(frame.at) + " UTC";
  const duration = Math.max(1, data.frames.length - 1);
  useLayoutEffect(() => {
    if (
      status !== "failed" &&
      frame.raster &&
      (!element || element.src !== new URL(frame.raster.url, location.href).href)
    )
      return;
    onView({
      kind: "observation",
      frame: viewFrame,
      target,
      image: element,
      moonImage: lunarImage.element,
      onPick: section.pick,
      ...(data.lens && !localSky ? { lens: data.lens } : {}),
      ...(data.terrain ? { terrain: { grid: data.terrain, progress: clock.position / duration } } : {}),
      arrive,
      sky: localSky,
      ...(frame.section && curtainImage.element
        ? { curtain: { ...frame.section, down: true, image: curtainImage.element } }
        : id === "dust" && slice && curtainImage.element
          ? {
              curtain: {
                points: dustPoints,
                heightKm: transect.height,
                exaggeration: transect.exaggeration,
                image: curtainImage.element,
              },
            }
          : {}),
      follow:
        !panel.map && !localSky && clock.cinematic && clock.playing
          ? storyCamera(id, target, clock.position / duration)
          : undefined,
    });
    remember?.({
      at: frame.at,
      choice: displayedChoice,
      city: city.name,
      chapter: section.chapter || (skyMode ? "sky" : slice ? "slice" : site ? `site:${site}` : ""),
      map: panel.map,
    });
  }, [
    frame,
    viewFrame,
    section.pick,
    section.chapter,
    target,
    element,
    data.lens,
    data.terrain,
    arrive,
    initial,
    clock.cinematic,
    clock.playing,
    clock.position,
    duration,
    localSky,
    panel.map,
    onView,
    id,
    displayedChoice,
    city.name,
    skyMode,
    slice,
    site,
    remember,
    curtainImage.element,
    lunarImage.element,
    status,
  ]);
  const pause = clock.pause;
  useEffect(() => {
    const canvas = document.querySelector(".zone-canvas canvas");
    const stop = () => pause();
    canvas?.addEventListener("pointerdown", stop);
    canvas?.addEventListener("wheel", stop, { passive: true });
    return () => {
      canvas?.removeEventListener("pointerdown", stop);
      canvas?.removeEventListener("wheel", stop);
    };
  }, [pause]);
  const chooseSite = (value: string) => {
    setSite(value);
    const point = data.sites?.find((p) => p.id === value);
    if (point) clock.seek(nearestFrame(data, point.at));
  };
  return (
    <ReplayPanel
      {...panel}
      title={meta.title}
      location={localSky ? `${city.name} · ${new Date(frame.at).getUTCFullYear()} sky` : meta.location}
      subtitle={meta.summary}
      status={localSky ? `${localSky.targetName} from ${city.name}` : caption}
      at={<time dateTime={new Date(frame.at).toISOString()}>{time}</time>}
      sources={<StorySources id={id} />}
      inset={
        <>
          <StoryOverlay
            slice={id === "dust" && slice}
            localSky={localSky}
            data={data}
            frame={frame}
            site={site}
            chooseSite={chooseSite}
          />
          {section.overlay}
        </>
      }
    >
      <StoryChoices
        id={id}
        city={city}
        choice={choice}
        select={(value) => {
          clock.pause();
          setChoice(value);
        }}
      />
      {section.controls}
      {id === "atmospheric-river" && (
        <div className="observatory-actions">
          <button type="button" onClick={onRadar}>
            View current Pacific radar
          </button>
          <p className="observation-note">
            Opens recent observed scans; radar time differs from the forecast.
          </p>
        </div>
      )}
      {data.sky && (
        <div className="observatory-actions">
          <button
            type="button"
            aria-pressed={skyMode && !panel.map}
            onClick={() => {
              clock.pause();
              if (!skyMode && id === "comet") {
                const visible = data.chapters.find((chapter) => chapter.label === "Above my horizon");
                if (visible) clock.seek(nearestFrame(data, visible.at));
              }
              panel.onMap(false);
              setSkyMode(!skyMode);
            }}
          >
            {skyMode && !panel.map ? "Back to Earth" : "See from my city"}
          </button>
        </div>
      )}
      {id === "dust" && (
        <div className="observatory-actions">
          <button
            type="button"
            aria-pressed={slice}
            onClick={() => {
              clock.seek(nearestFrame(data, Date.parse("2020-06-23T12:00:00Z")));
              setSlice(!slice);
            }}
          >
            {slice ? "Close lidar slice" : "Open lidar slice"}
          </button>
        </div>
      )}
      <div className="story-time">
        <label htmlFor="earth-story-time">
          {data.timelineLabel ??
            (id === "fire" ? "Detection time" : id === "comet" ? "July 2020 · UTC" : "Observation time")}
        </label>
        <time dateTime={new Date(frame.at).toISOString()}>{time}</time>
        <input
          id="earth-story-time"
          className="scrub-slider"
          type="range"
          min={0}
          max={data.frames.length - 1}
          value={index}
          aria-valuetext={time}
          disabled={busy}
          onInput={(event) => clock.seek(event.currentTarget.valueAsNumber)}
        />
      </div>
      <div className="observatory-actions">
        <button
          data-playback-start={!clock.playing || undefined}
          type="button"
          onClick={clock.toggle}
          disabled={busy}
        >
          {clock.playing ? "Pause" : index === data.frames.length - 1 ? "Replay" : "Play"}
        </button>
        {data.chapters.map((chapter) => (
          <button
            type="button"
            key={chapter.label}
            disabled={busy}
            onClick={() => clock.seek(nearestFrame(data, chapter.at))}
          >
            {chapter.label}
          </button>
        ))}
      </div>
      {frame.measurements && (
        <dl className="observation-values">
          {frame.measurements.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {id === "north" && (
        <StoryCompass
          value={
            Number(frame.measurements?.[1]?.value.split("°")[0]) *
            (frame.measurements?.[1]?.value.includes("west") ? -1 : 1)
          }
        />
      )}
      {data.sites && (
        <label className="observation-picker">
          <span>Survey measurement</span>
          <select value={site} onChange={(e) => chooseSite(e.currentTarget.value)}>
            <option value="">Choose a marked site</option>
            {data.sites.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && <p className="observation-note">{selected.value}</p>}
      {data.series && <ObservationChart series={data.series} at={frame.at} units={data.units} />}
      {data.legend && (
        <ul className="story-legend">
          {data.legend.map((item) => (
            <li key={item.label}>
              <i style={{ backgroundColor: item.color }} data-ramp="" />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {(busy || status === "loading") && (
        <p role="status" className="observation-note">
          Loading the selected observations…
        </p>
      )}
      {failed && (
        <p role="status" className="observation-note">
          The selected data could not load. Previous observations stay visible.{" "}
          <button type="button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {status === "failed" && (
        <p role="status" className="observation-note">
          This satellite image could not load. The last available view stays visible.{" "}
          <button
            type="button"
            onClick={
              image.status === "failed"
                ? image.retry
                : curtainImage.status === "failed"
                  ? curtainImage.retry
                  : lunarImage.retry
            }
          >
            Retry image
          </button>
        </p>
      )}
      <p className="observation-note">{meta.note}</p>
    </ReplayPanel>
  );
}
