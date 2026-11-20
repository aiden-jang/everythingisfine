import type { RefObject } from "react";
import { PlaybackButton } from "../PlaybackButton";
import { StoryDock } from "../observations/StoryDock";
import { TimelineTrack } from "../observations/TimelineTrack";
import { PEAK_MINUTE } from "./StormNarrative";
import { FIXES, TRACK_MINUTES, stormClock } from "./stormTrack";

export function StormTransport({
  at,
  minute,
  fixIndex,
  playing,
  ended,
  comparing,
  buttonRef,
  onSeek,
  onInspect,
  onToggle,
}: {
  at: number;
  minute: number;
  fixIndex: number;
  playing: boolean;
  ended: boolean;
  comparing: boolean;
  buttonRef: RefObject<HTMLButtonElement>;
  onSeek: (value: number) => void;
  onInspect: (minute: number) => void;
  onToggle: () => void;
}) {
  const progress = stormClock(at);
  const max = comparing ? FIXES.length - 1 : TRACK_MINUTES;
  const value = comparing ? fixIndex : minute;
  return (
    <StoryDock label="Eye of the Storm playback">
      <div className="survey-transport" data-comparing={comparing}>
        <div className="story-dock-time storm-timeline">
          <label htmlFor="storm-time">{comparing ? "Recorded fix" : "Track time"}</label>
          {comparing && (
            <span className="storm-fix-count">
              {fixIndex + 1} / {FIXES.length}
            </span>
          )}
          <time dateTime={new Date(at).toISOString()}>{progress}</time>
        </div>
        <TimelineTrack
          max={max}
          current={value}
          landmark={
            comparing
              ? undefined
              : {
                  at: TRACK_MINUTES,
                  label: `Landfall · ${stormClock(FIXES.at(-1)!.time)}`,
                  select: () => onInspect(TRACK_MINUTES),
                }
          }
        >
          <input
            id="storm-time"
            className="scrub-slider storm-scrub"
            type="range"
            min={0}
            max={max}
            value={value}
            aria-valuetext={progress}
            onInput={(event) => onSeek(event.currentTarget.valueAsNumber)}
          />
        </TimelineTrack>
        <div className="story-dock-actions archive-scene-controls">
          <PlaybackButton
            buttonRef={buttonRef}
            playing={playing}
            ended={comparing || ended}
            className="archive-scene-button"
            onClick={onToggle}
          />
          {!comparing && (
            <>
              <button type="button" aria-label="Offshore peak" onClick={() => onInspect(PEAK_MINUTE)}>
                Peak
              </button>
              <button type="button" onClick={() => onInspect(TRACK_MINUTES)}>
                Landfall
              </button>
            </>
          )}
        </div>
      </div>
    </StoryDock>
  );
}
