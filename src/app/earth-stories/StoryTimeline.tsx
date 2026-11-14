import { PlaybackButton } from "../PlaybackButton";
import type { EarthStoryData, StoryFrame } from "./types";
import type { useStoryClock } from "./useStoryClock";
import { FrameComparison } from "../observations/FrameComparison";
import { layerTime } from "../layerTime";
import { refreshAnnotations } from "../../globe/annotationInput";

type Clock = ReturnType<typeof useStoryClock>;
export function StoryTimeline({
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
      {restored && (
        <p className="observation-note">Opened at a saved moment. Choose Restart to begin again.</p>
      )}
      <div className="story-time">
        <label htmlFor="earth-story-time">{label}</label>
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
        <PlaybackButton
          playing={clock.playing}
          ended={index === data.frames.length - 1}
          onClick={clock.toggle}
          disabled={busy}
        />
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
      </div>
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
