import { useLayoutEffect, useRef, useState } from "react";
import { useStoryNavigation } from "../journeys/StoryNavigation";
import { PlaybackButton } from "../PlaybackButton";
import type { EarthStoryData, StoryFrame } from "./types";
import type { useStoryClock } from "./useStoryClock";
import { FrameComparison } from "../observations/FrameComparison";
import { layerTime } from "../layerTime";
import { refreshAnnotations } from "../../globe/annotationInput";
import { StoryDock } from "../observations/StoryDock";

type Clock = ReturnType<typeof useStoryClock>;
export function StoryTimeline({
  startLabel,
  data,
  frame,
  settled,
  index,
  clock,
  busy,
  label,
  time,
  restored,
}: {
  startLabel?: string | undefined;
  data: EarthStoryData;
  frame: StoryFrame;
  settled: boolean;
  index: number;
  clock: Clock;
  busy: boolean;
  label: string;
  time: string;
  restored: boolean;
}) {
  const annual = frame.dateTime?.length === 4;
  const [expandedAt, expand] = useState<number | null>(null);
  const finished =
    settled && !clock.playing && index === data.frames.length - 1 && frame.at === data.frames[index]?.at;
  const compact = finished && expandedAt !== frame.at;
  const toggle = useRef<HTMLButtonElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const wasFinished = useRef(false);
  useLayoutEffect(() => {
    if (
      finished &&
      !wasFinished.current &&
      document.activeElement === slider.current &&
      toggle.current?.getClientRects().length
    ) {
      toggle.current.focus({ preventScroll: true });
    }
    wasFinished.current = finished;
  }, [finished]);
  const navigation = useStoryNavigation();
  const showRestore = restored && (!navigation || !!navigation.returnLabel);
  const nearest = (at: number) =>
    data.frames.reduce(
      (best, item, i) => (Math.abs(item.at - at) < Math.abs(data.frames[best]!.at - at) ? i : best),
      0,
    );
  const milestones = data.chapters.length
    ? data.chapters
    : [
        { at: data.frames[0]!.at, label: "First moment" },
        { at: data.frames.at(-1)!.at, label: "Last moment" },
      ];
  return (
    <>
      {showRestore && (
        <p className="observation-note">
          Opened at a saved moment. Choose {index === data.frames.length - 1 ? "Replay" : "Restart"} to begin
          again.
        </p>
      )}
      <StoryDock>
        <div className="story-time" data-compact-ending={compact || undefined}>
          {finished && (
            <button
              type="button"
              className="ending-timeline-toggle"
              ref={toggle}
              aria-expanded={!compact}
              aria-controls="earth-story-time"
              onClick={() => expand(compact ? frame.at : null)}
            >
              {compact ? "Timeline" : "Hide timeline"}
            </button>
          )}
          <label htmlFor="earth-story-time">{label}</label>
          <time dateTime={frame.dateTime ?? new Date(frame.at).toISOString()}>
            {finished && annual ? frame.dateTime : time}
          </time>
          <input
            id="earth-story-time"
            ref={slider}
            className="scrub-slider"
            type="range"
            min={0}
            max={data.frames.length - 1}
            value={index}
            aria-valuetext={time}
            disabled={busy}
            onInput={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (next !== data.frames.length - 1) expand(null);
              clock.seek(next);
            }}
          />
        </div>
        <div className="observatory-actions">
          <PlaybackButton
            playing={clock.playing}
            ended={index === data.frames.length - 1}
            startLabel={startLabel}
            onClick={clock.toggle}
            disabled={busy}
          />
          {index < data.frames.length - 1 && (!startLabel || clock.playing) && (
            <button
              type="button"
              title="Restart the story and its cinematic entrance"
              onClick={() => {
                refreshAnnotations({ camera: "resume" });
                clock.replay();
              }}
              disabled={busy}
            >
              Restart
            </button>
          )}
        </div>
      </StoryDock>
      <div className="story-milestones" role="group" aria-label="Story moments">
        {milestones.map((chapter) => {
          const at = nearest(chapter.at),
            item = data.frames[at]!;
          const image = item.photograph?.url ?? item.raster?.url;
          return (
            <button
              type="button"
              key={chapter.label}
              disabled={busy}
              aria-label={chapter.label}
              aria-pressed={index === at}
              onClick={() => clock.seek(at)}
            >
              {image && <img src={image} alt="" loading="lazy" decoding="async" width="160" height="72" />}
              <strong>{chapter.label}</strong>
              <small>{item.timeLabel ?? layerTime(item.at)}</small>
            </button>
          );
        })}
      </div>
      <FrameComparison frames={data.frames} index={index} select={clock.seek} />
      {settled &&
        index === data.frames.length - 1 &&
        frame.at === data.frames[index]!.at &&
        !clock.playing && (
          <div className="story-finish" role="status">
            <strong>{frame.sequence ? "End of this sequence" : "Last available moment"}</strong>
            <p>{frame.caption}</p>
            <small>{frame.timeLabel ?? layerTime(frame.at)}. Explore this view or continue below.</small>
          </div>
        )}
    </>
  );
}
