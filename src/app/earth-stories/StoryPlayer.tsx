import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useObservationImage } from "../observations/useObservationData";
import { ObservationChart } from "../observations/ObservationChart";
import { useStorySession } from "../observations/StorySession";
import { SkyCityPicker, type SkyCityPreference } from "../tonight/SkyCityPicker";
import { earthStories, type EarthStoryId } from "./catalogue";
import { asset, type EarthStoryData } from "./types";
import { useStoryClock } from "./useStoryClock";
import { storyCamera } from "./motion";
import transect from "../../sources/earth-stories/dust-transect.json";
import { point } from "./types";
import { StoryOverlay } from "./StoryOverlay";
import { StoryCompass } from "./StoryCompass";

const dustPoints = transect.points.map(point);
const dustTarget = { lon: -84, lat: 22, zoom: 1.8 };
const format = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
const nearest = (data: EarthStoryData, at?: number) =>
  at === undefined
    ? 0
    : data.frames.reduce(
        (best, frame, i) => (Math.abs(frame.at - at) < Math.abs(data.frames[best]!.at - at) ? i : best),
        0,
      );

type Props = ReplayProps & { id: EarthStoryId; city: SkyCityPreference };

export function StoryPlayer({
  data,
  choice,
  setChoice,
  busy,
  failed,
  retry,
  city,
  id,
  onView,
  ...panel
}: Props & {
  data: EarthStoryData;
  choice: string;
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
  if (id === "ozone" && restoredAt !== undefined)
    restoredAt = Date.parse(
      `${new Date(data.frames[0]!.at).getUTCFullYear()}${new Date(restoredAt).toISOString().slice(4)}`,
    );
  const [start] = useState(() => nearest(data, restoredAt));
  const selected = data.sites?.find((p) => p.id === site);
  const waiting = useRef(true);
  const clock = useStoryClock(data.frames.length, start, waiting, !!initial);
  const index = Math.min(data.frames.length - 1, Math.floor(clock.position));
  const current = data.frames[index]!;
  const requested = useMemo(() => data.geometry?.(current) ?? current, [data, current]);
  const image = useObservationImage(requested.raster?.url, id);
  const curtainImage = useObservationImage(id === "dust" && slice ? asset(transect.image) : undefined);
  const holding = useRef({ frame: requested, element: image.element, caption: current.caption });
  if (!requested.raster || image.status === "ready")
    holding.current = { frame: requested, element: image.element, caption: current.caption };
  const { frame, element, caption } = holding.current;
  const status = image.status;
  waiting.current = busy || !ready || status === "loading" || status === "failed";
  const target = useMemo(
    () =>
      id === "dust" && slice
        ? dustTarget
        : selected
          ? { ...data.target, lon: selected.lon, lat: selected.lat }
          : data.target,
    [selected, data.target, id, slice],
  );
  const localSky = useMemo(
    () => (id === "comet" && skyMode && !panel.map ? data.sky?.(frame.at) : undefined),
    [id, skyMode, panel.map, data, frame.at],
  );
  const time = format.format(frame.at) + " UTC";
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
      frame,
      target,
      image: element,
      ...(data.lens ? { lens: data.lens } : {}),
      arrive,
      sky: localSky,
      ...(id === "dust" && slice && curtainImage.element
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
      choice,
      city: city.name,
      chapter: skyMode ? "sky" : slice ? "slice" : site ? `site:${site}` : "",
      map: panel.map,
    });
  }, [
    frame,
    target,
    element,
    data.lens,
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
    choice,
    city.name,
    skyMode,
    slice,
    site,
    remember,
    curtainImage.element,
    status,
  ]);
  useEffect(() => {
    const canvas = document.querySelector(".zone-canvas canvas");
    const stop = () => clock.pause();
    canvas?.addEventListener("pointerdown", stop);
    canvas?.addEventListener("wheel", stop, { passive: true });
    return () => {
      canvas?.removeEventListener("pointerdown", stop);
      canvas?.removeEventListener("wheel", stop);
    };
  }, [clock]);
  const chooseSite = (value: string) => {
    setSite(value);
    const point = data.sites?.find((p) => p.id === value);
    if (point) clock.seek(nearest(data, point.at));
  };
  return (
    <ReplayPanel
      {...panel}
      title={meta.title}
      location={localSky ? `${city.name} · July 2020 sky` : meta.location}
      subtitle={meta.summary}
      status={localSky ? `NEOWISE from ${city.name} · ${frame.measurements?.[1]?.value}` : caption}
      at={<time dateTime={new Date(frame.at).toISOString()}>{time}</time>}
      sources={
        <>
          <p>{meta.note}</p>
          <a href={meta.url} target="_blank" rel="noreferrer">
            {meta.source}
          </a>
          {id === "water" && <span>JPL RL06 V2 · monthly archive</span>}
          {(id === "fault" || id === "fire") && (
            <a href="https://www.usgs.gov/3d-elevation-program">USGS 3DEP shaded terrain</a>
          )}
          {id === "fault" && (
            <a href="https://aria-share.jpl.nasa.gov/20190704-California_EQ/">
              NASA / JPL-Caltech · JAXA ALOS-2 radar
            </a>
          )}
          {id === "dust" && (
            <a href="https://asdc.larc.nasa.gov/calipso-imagery/lidar/browse_images/std_v500_showdate.php?browse_date=2020-06-23">
              NASA / CNES CALIPSO · 532 nm backscatter · V5.00
            </a>
          )}
        </>
      }
      inset={
        <StoryOverlay
          slice={id === "dust" && slice}
          localSky={localSky}
          data={data}
          frame={frame}
          site={site}
          chooseSite={chooseSite}
        />
      }
    >
      {(id === "north" || id === "comet") && <SkyCityPicker city={city.name} select={city.select} />}
      {id === "ozone" && (
        <label className="observation-picker">
          <span>Compare season</span>
          <select
            value={choice}
            onChange={(e) => {
              clock.pause();
              setChoice(e.currentTarget.value);
            }}
          >
            <option value="2006">2006</option>
            <option value="2019">2019</option>
          </select>
        </label>
      )}
      {id === "water" && (
        <label className="observation-picker">
          <span>Region</span>
          <select
            value={choice}
            onChange={(e) => {
              clock.pause();
              setChoice(e.currentTarget.value);
            }}
          >
            {["California", "Northern California", "Central Valley"].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {id === "comet" && (
        <div className="observatory-actions">
          <button
            type="button"
            aria-pressed={skyMode && !panel.map}
            onClick={() => {
              clock.pause();
              if (!skyMode) {
                const visible = data.chapters.find((chapter) => chapter.label === "Above my horizon");
                if (visible) clock.seek(nearest(data, visible.at));
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
              clock.seek(nearest(data, Date.parse("2020-06-23T12:00:00Z")));
              setSlice(!slice);
            }}
          >
            {slice ? "Close lidar slice" : "Open lidar slice"}
          </button>
        </div>
      )}
      <div className="story-time">
        <label htmlFor="earth-story-time">
          {id === "fire" ? "Detection time" : id === "comet" ? "July 2020 · UTC" : "Archive time"}
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
        <button type="button" onClick={clock.toggle} disabled={busy}>
          {clock.playing ? "Pause" : index === data.frames.length - 1 ? "Replay" : "Play"}
        </button>
        {data.chapters.map((chapter) => (
          <button
            type="button"
            key={chapter.label}
            disabled={busy}
            onClick={() => clock.seek(nearest(data, chapter.at))}
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
          The selected archive could not load.{" "}
          <button type="button" onClick={retry}>
            Retry archive
          </button>
        </p>
      )}
      {status === "failed" && (
        <p role="status" className="observation-note">
          This satellite image could not load. The last available view stays visible.{" "}
          <button type="button" onClick={image.retry}>
            Retry image
          </button>
        </p>
      )}
      <p className="observation-note">{meta.note}</p>
    </ReplayPanel>
  );
}
