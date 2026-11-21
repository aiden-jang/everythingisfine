import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CameraState } from "../../globe/controlsTypes";
import { iceberg } from "../../sources/observations/iceberg";
import { useStoryClock } from "../earth-stories/useStoryClock";
import { useStoryCompletion } from "../journeys/useStoryCompletion";
import { PlaybackButton } from "../PlaybackButton";
import { ReplayPanel, type ReplayProps } from "../observations/RecordedReplay";
import { StoryDock } from "../observations/StoryDock";
import { useStorySession } from "../observations/StorySession";
import { useObservationData, useObservationImage } from "../observations/useObservationData";
import { useReportStorySource } from "../observations/StorySourceStatus";
import { captureReplayFrame, restoreReplayFrame } from "../observations/replayReturn";
import { StoryLoading } from "../StoryLoading";
import { BREAKUP, END, dayAt, driftCamera, tracks } from "./icebergTimeline";
import { IcebergWorld, icebergSources } from "./IcebergWorld";

export function IcebergDrift({ onView, ...panel }: ReplayProps) {
  const { initial, remember } = useStorySession();
  const [choice, setChoice] = useState(() => tracks.find(({ id }) => id === initial?.choice)?.id ?? "A");
  const [opening, setOpening] = useState(() => initial?.at === undefined);
  const [photo, setPhoto] = useState(() => initial?.chapter === "photo");
  const [linked, setLinked] = useState(false);
  const [arrived, setArrived] = useState(false);
  const saved = useRef<ReturnType<typeof captureReplayFrame>>();
  const photoButton = useRef<HTMLButtonElement>(null);
  const readingPanel = useRef<HTMLDivElement>(null);
  const held = useRef(true);
  const introduction = useRef<CameraState | undefined>(opening && !panel.map ? driftCamera(0) : undefined);
  const framing = useMemo(() => ({ map: panel.map, onReady: () => setArrived(true) }), [panel.map]);
  const arrive = useCallback(() => {}, []);
  const { data, state, retry } = useObservationData(iceberg, choice);
  useReportStorySource("iceberg", state, retry);
  held.current = state !== "ready" || !arrived;
  const clock = useStoryClock(END + 1, dayAt(initial?.at), held, initial?.at !== undefined, false);
  const { pause } = clock;
  const index = Math.floor(clock.position);
  const frame = data?.frames[index];
  const marks = frame?.marks ?? [];
  const photograph = frame?.photograph;
  const reading = frame?.measurements?.[0];
  const image = useObservationImage(photo ? photograph?.url : undefined);
  const showingPhoto = photo && !!photograph;
  const selectMark = useCallback(
    (selected: number) => {
      const mark = frame?.marks?.[selected];
      if (!mark?.id) return;
      pause();
      setOpening(false);
      setLinked(true);
      setChoice(mark.id);
      requestAnimationFrame(() => readingPanel.current?.scrollIntoView({ block: "nearest" }));
    },
    [frame?.marks, pause],
  );
  const finished = index === END && !clock.playing;
  useStoryCompletion(finished && !opening);

  const target = introduction.current ?? data?.target;
  const following = clock.playing && clock.cinematic && !panel.map;
  const pose = following ? clock.position : null;
  useLayoutEffect(() => {
    if (!data || !frame || !target || state !== "ready") return;
    onView({
      kind: "observation",
      frame,
      target,
      image: null,
      ...(data.lens ? { lens: data.lens } : {}),
      holdGeography: arrived && !following,
      arrive,
      comparisonFrame: framing,
      capture: !showingPhoto,
      ...(pose === null ? {} : { follow: driftCamera(pose) }),
      ...(showingPhoto ? {} : { pickMarks: { points: frame.marks ?? [], select: selectMark } }),
    });
    remember?.({ choice, chapter: showingPhoto ? "photo" : "", map: panel.map });
  }, [
    data,
    frame,
    state,
    panel.map,
    arrived,
    following,
    arrive,
    framing,
    target,
    showingPhoto,
    pose,
    selectMark,
    onView,
    remember,
    choice,
  ]);

  function seek(day: number) {
    setOpening(false);
    setPhoto(false);
    clock.seek(day);
  }

  function togglePhoto() {
    if (photo) {
      setPhoto(false);
      restoreReplayFrame(saved.current, panel, () => photoButton.current);
    } else {
      saved.current = captureReplayFrame(panel);
      clock.pause();
      setOpening(false);
      setPhoto(true);
    }
  }

  const caption = opening
    ? "One iceberg, headed toward South Georgia."
    : index < BREAKUP
      ? "The drift toward South Georgia"
      : "The recorded tracks separate";
  return (
    <ReplayPanel
      {...panel}
      title="Iceberg Drift"
      location="Scotia Sea · South Georgia"
      subtitle="Follow A-68A toward South Georgia, then see where the fragments were recorded."
      className="iceberg-journey"
      status={showingPhoto ? null : caption}
      at={
        !showingPhoto && frame ? (
          <time dateTime={new Date(frame.at).toISOString()}>{frame.timeLabel}</time>
        ) : null
      }
      inset={
        showingPhoto ? (
          <figure className="iceberg-photo" aria-busy={image.status === "loading"}>
            <div className="iceberg-photo-image">
              {image.status === "ready" && image.element && (
                <img src={image.element.src} alt={photograph.alt} />
              )}
            </div>
            <figcaption>{photograph.alt}</figcaption>
          </figure>
        ) : (
          <IcebergWorld marks={marks} fragment={choice} select={selectMark} linked={linked} />
        )
      }
      sources={
        <>
          {icebergSources}
          <p>{data?.note}</p>
        </>
      }
    >
      {!frame && state === "loading" && <StoryLoading>Loading recorded iceberg tracks…</StoryLoading>}
      {state === "failed" && (
        <div role="status" className="observatory-actions">
          <p>The recorded tracks couldn’t open.</p>
          <button type="button" onClick={retry}>
            Retry tracks
          </button>
        </div>
      )}
      {frame && data && (
        <>
          <div className="archive-scene-caption iceberg-reading" ref={readingPanel} data-evidence-body="">
            <h3 data-evidence-point={linked || undefined}>{reading?.label}</h3>
            <p>{reading?.value}</p>
            <label className="observation-picker">
              <span>Iceberg</span>
              <select
                value={choice}
                onChange={(event) => {
                  const track = tracks.find(({ id }) => id === event.currentTarget.value);
                  if (!track) return;
                  setChoice(track.id);
                  setLinked(true);
                  seek(marks.some(({ id }) => id === track.id) ? index : track.fixes.at(-1)![0]);
                }}
              >
                {iceberg.options?.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {photograph && (
            <div className="observatory-actions">
              <button type="button" ref={photoButton} aria-pressed={photo} onClick={togglePhoto}>
                {photo ? "Return to tracks" : "Show satellite image"}
              </button>
              {showingPhoto && image.status === "failed" && (
                <button type="button" onClick={image.retry}>
                  Retry image
                </button>
              )}
              {showingPhoto && image.status === "loading" && (
                <span role="status">Opening the archived image…</span>
              )}
            </div>
          )}
          {!showingPhoto && (
            <>
              <div className="archive-scene-controls" aria-label="Drift chapters">
                {data.chapters?.map((chapter) => (
                  <button
                    key={chapter.index}
                    className="archive-scene-button"
                    type="button"
                    onClick={() => {
                      if (chapter.index >= BREAKUP) {
                        if (arrived) panel.restoreCamera?.(data.target);
                        else introduction.current = data.target;
                      }
                      seek(chapter.index);
                    }}
                  >
                    {chapter.label}
                  </button>
                ))}
              </div>
              <StoryDock>
                <div className="observation-transport" data-drift-opening={opening || undefined}>
                  <span>Track date · {frame.timeLabel}</span>
                  <input
                    className="scrub-slider observation-scrub"
                    type="range"
                    min={0}
                    max={END}
                    value={index}
                    aria-label="Track date"
                    aria-valuetext={frame.timeLabel}
                    onChange={(event) => seek(event.currentTarget.valueAsNumber)}
                  />
                  <div className="observatory-actions">
                    <PlaybackButton
                      playing={clock.playing}
                      ended={finished}
                      startLabel={opening ? "Follow the drift" : undefined}
                      onClick={() => {
                        setOpening(false);
                        setLinked(false);
                        if (clock.playing) clock.pause();
                        else if (finished) clock.replay();
                        else clock.resume();
                      }}
                    />
                  </div>
                </div>
              </StoryDock>
            </>
          )}
        </>
      )}
    </ReplayPanel>
  );
}
