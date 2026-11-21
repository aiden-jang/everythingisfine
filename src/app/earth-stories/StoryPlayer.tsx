import { useArchiveSky } from "./CelestialView";
import { StoryFinding } from "../journeys/StoryFinding";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { StoryLoading } from "../StoryLoading";
import { useJourneyGestures } from "../journeyCamera";
import { storyMapTarget } from "./mapFraming";
import { StoryTimeline } from "./StoryTimeline";
import { nearestFrame, openingFrame } from "./nearestFrame";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { useObservationImage } from "../observations/useObservationData";
import { useStorySession } from "../observations/StorySession";
import { type SkyCityPreference } from "../tonight/SkyCityPicker";
import { earthStories, type EarthStoryId } from "./catalogue";
import { asset, point, type EarthStoryData } from "./types";
import { useStoryClock } from "./useStoryClock";
import { storyCamera } from "./motion";
import transect from "../../sources/earth-stories/dust-transect.json";
import { StoryOverlay } from "./StoryOverlay";
import { StoryReadings } from "./StoryReadings";
import { StoryImageRecovery, StoryRecovery } from "./StoryRecovery";
import { StorySideActions } from "./StorySideActions";
import { StoryChoices } from "./StoryChoices";
import { useMooringInspection } from "./useMooringInspection";
import { useBloomComparison } from "./useBloomComparison";
import { useShorelineComparison } from "./useShorelineComparison";
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
  const orbitStory = id === "apophis" || id === "eclipse";
  const [ready, setReady] = useState(false);
  const [slice, setSlice] = useState(initial?.chapter === "slice");
  const [site, setSite] = useState(initial?.chapter?.startsWith("site:") ? initial.chapter.slice(5) : "");
  const arrive = useCallback(() => setReady(true), []);
  const [start] = useState(() => openingFrame(data, id, initial?.at));
  const selected = data.sites?.find((p) => p.id === site);
  const waiting = useRef(true);
  const startLabel =
    id === "seafloor" ? "Begin the descent" : id === "aral" ? "Follow the shoreline" : undefined;
  const surveyed = id === "bloom" || id === "nino";
  const clock = useStoryClock(
    data.frames.length,
    start,
    waiting,
    initial?.at !== undefined,
    !startLabel && !surveyed,
    id === "seafloor" ? 8500 : data.playbackDuration,
    data.pace,
  );
  const index = Math.min(data.frames.length - 1, Math.floor(clock.position));
  const duration = Math.max(1, data.frames.length - 1);
  const current = data.frames[index]!;
  const requested = useMemo(() => data.geometry?.(current) ?? current, [data, current]);
  const image = useObservationImage(requested.raster?.url, id);
  const bloom = useBloomComparison({
    enabled: id === "bloom",
    frame: requested,
    primary: image.element,
    choice: displayedChoice,
    chapter: initial?.chapter,
    pause: clock.pause,
  });
  const lunarImage = useObservationImage(data.lunarImage);
  const curtainImage = useObservationImage(
    requested.section?.image ?? (id === "dust" && slice ? asset(transect.image) : undefined),
    `${id}:section`,
  );
  const holding = useRef({
    frame: requested,
    element: image.element,
    caption: current.caption,
    surface: bloom.surface,
  });
  if (
    (!requested.raster || image.status === "ready") &&
    (!requested.section || curtainImage.status === "ready") &&
    (bloom.status === "ready" || !holding.current.surface)
  )
    holding.current = {
      frame: requested,
      element: image.element,
      caption: current.caption,
      surface: bloom.surface,
    };
  const { frame, element, caption, surface } = holding.current;
  const moorings = useMooringInspection(frame.moorings, data.frames, initial?.chapter, clock.pause);
  const openCurtain = id !== "nino" || ready || initial?.at !== undefined;
  const section = useTerrainSection(
    data.terrain,
    initial?.chapter,
    () => {
      clock.pause();
      panel.onMap(true);
    },
    !clock.playing && index === duration,
  );
  const viewFrame = useMemo(
    () =>
      data.terrain
        ? {
            ...frame,
            ...(section.inspecting ? { paths: section.paths } : {}),
            ...(section.marks.length ? { marks: section.marks } : {}),
          }
        : frame,
    [data.terrain, frame, section.inspecting, section.paths, section.marks],
  );
  const status =
    image.status !== "ready"
      ? image.status
      : curtainImage.status !== "ready"
        ? curtainImage.status
        : lunarImage.status;
  waiting.current = busy || !ready || status !== "ready" || bloom.status !== "ready";
  const mapTarget = useMemo(() => storyMapTarget(data), [data]);
  const target = useMemo(
    () =>
      id === "dust" && slice
        ? dustTarget
        : selected
          ? { ...data.target, lon: selected.lon, lat: selected.lat }
          : panel.map
            ? mapTarget
            : data.target,
    [selected, data.target, mapTarget, panel.map, id, slice],
  );
  const sky = useArchiveSky(data, viewFrame, initial, panel, clock, orbitStory);
  const { localSky, skyMode, setSkyMode } = sky;
  const time = frame.timeLabel ?? format.format(frame.at) + " UTC";
  const settled = !busy && status === "ready" && bloom.status === "ready";
  const finished = settled && !clock.playing && clock.position >= duration;
  useStoryCompletion(finished);
  const shoreline = useShorelineComparison({
    basins: data.basins,
    finished,
    frame,
    map: panel.map,
    chapter: initial?.chapter,
    pause: clock.pause,
    playing: clock.playing,
  });
  waiting.current ||= shoreline.holding;
  const displayedImage = shoreline.image ?? element;
  const comparingShoreline = id === "aral" && finished;
  const holdGeography = ready && (shoreline.holding || (!!shoreline.basin && !clock.playing));
  const flying = clock.cinematic && clock.playing;
  const motionProgress =
    flying && !orbitStory && !surveyed && !panel.map && !localSky && !shoreline.holding
      ? clock.position / duration
      : undefined;
  const terrainProgress = data.terrain
    ? section.inspecting || panel.map
      ? 1
      : Math.min(1, (clock.position / duration) * 2.3)
    : 0;
  useLayoutEffect(() => {
    if (status === "loading" && (id !== "bloom" || !element)) return;
    if (frame.raster && (!element || element.src !== new URL(frame.raster.url, location.href).href)) return;
    onView({
      kind: "observation",
      frame: sky.sceneFrame,
      target,
      image: displayedImage,
      ...(bloom.comparing && surface ? { surface, surveyDivider: bloom.divider } : {}),
      moonImage: lunarImage.element,
      onPick: section.pick,
      pickMarks: shoreline.pickMarks ?? (openCurtain ? moorings.picks : undefined),
      holdGeography,
      ...(data.lens && !localSky ? { lens: data.lens } : {}),
      ...(data.terrain ? { terrain: { grid: data.terrain, progress: terrainProgress } } : {}),
      arrive,
      ...(shoreline.framing ? { comparisonFrame: shoreline.framing } : {}),
      sky: localSky,
      ...(frame.section && curtainImage.element && openCurtain
        ? {
            curtain: {
              ...frame.section,
              down: true,
              image: curtainImage.element,
              moorings: moorings.visible,
              mooringFocus: moorings.selected,
            },
          }
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
      follow: motionProgress === undefined ? undefined : storyCamera(id, target, motionProgress),
    });
    remember?.({
      at: frame.at,
      choice: displayedChoice,
      city: city.name,
      chapter:
        shoreline.chapter ||
        section.chapter ||
        moorings.chapter ||
        bloom.chapter ||
        (skyMode ? "sky" : slice ? "slice" : site ? `site:${site}` : ""),
      map: panel.map,
    });
  }, [
    frame,
    sky.sceneFrame,
    bloom.comparing,
    bloom.divider,
    bloom.chapter,
    surface,
    section.pick,
    section.chapter,
    terrainProgress,
    target,
    element,
    displayedImage,
    shoreline.framing,
    shoreline.chapter,
    shoreline.pickMarks,
    holdGeography,
    data.lens,
    data.terrain,
    arrive,
    motionProgress,
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
    moorings.visible,
    moorings.selected,
    moorings.chapter,
    moorings.picks,
    openCurtain,
    status,
  ]);
  useJourneyGestures(clock.pause, clock.resume, clock.position < duration);
  const chooseSite = (value: string) => {
    setSite(value);
    const point = data.sites?.find((p) => p.id === value);
    if (point) clock.seek(nearestFrame(data, point.at));
  };
  return (
    <ReplayPanel
      {...panel}
      horizon={orbitStory && !!localSky}
      projection={sky.projection}
      focusOnEntry={false}
      title={meta.title}
      location={localSky ? `${city.name} · ${new Date(frame.at).getUTCFullYear()} sky` : meta.location}
      subtitle={meta.summary}
      className={orbitStory ? "celestial-journey" : surveyed || id === "seafloor" ? `${id}-journey` : ""}
      finding={id !== "aral"}
      status={
        failed && id === "reef" && choice === "Recent observations"
          ? "Recent reef data unavailable · showing previous observations"
          : comparingShoreline
            ? null
            : (sky.status ?? caption)
      }
      at={
        comparingShoreline || orbitStory ? undefined : (
          <time dateTime={frame.dateTime ?? new Date(frame.at).toISOString()}>{time}</time>
        )
      }
      sharedMoment={
        initial?.at !== undefined && id === "aral" ? { ...initial, at: data.frames[start]!.at } : undefined
      }
      sources={<StorySources id={id} />}
      inset={
        <>
          <StoryOverlay localSky={localSky} data={data} frame={frame} site={site} chooseSite={chooseSite} />
          {shoreline.labels}
          {openCurtain && moorings.labels}
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
      {section.chart}
      {moorings.controls}
      {!orbitStory && (
        <StorySideActions
          {...{
            id,
            data,
            map: panel.map,
            onMap: panel.onMap,
            onRadar,
            clock,
            skyMode,
            setSkyMode,
            slice,
            setSlice,
          }}
        />
      )}
      {(busy || status === "loading") && <StoryLoading>Loading the selected observations…</StoryLoading>}
      {shoreline.reading}
      <StoryTimeline
        startLabel={clock.cinematic && clock.position === 0 ? startLabel : undefined}
        data={data}
        frame={{ ...frame, caption }}
        settled={settled}
        index={index}
        clock={clock}
        busy={busy}
        time={time}
        restored={initial?.at !== undefined}
        comparison={bloom.controls}
        label={
          data.timelineLabel ??
          (id === "fire" ? "Detection time" : id === "comet" ? "July 2020 · UTC" : "Observation time")
        }
      />
      {comparingShoreline ? (
        <StoryFinding id={id} completed>
          {shoreline.controls}
        </StoryFinding>
      ) : (
        shoreline.controls
      )}
      <StoryReadings
        data={data}
        frame={frame}
        index={index}
        north={id === "north"}
        site={site}
        selected={selected}
        chooseSite={chooseSite}
      />
      {failed && (
        <StoryRecovery
          reefRecent={id === "reef" && choice === "Recent observations"}
          retry={retry}
          archive={() => setChoice("2023 archive")}
          holding
        />
      )}
      {status === "failed" && (
        <StoryImageRecovery
          retry={[image, curtainImage, lunarImage].find((asset) => asset.status === "failed")!.retry}
        />
      )}
    </ReplayPanel>
  );
}
