import { DustSliceControls } from "./DustSliceControls";
import { nearestFrame } from "./nearestFrame";
import type { EarthStoryId } from "./catalogue";
import type { EarthStoryData } from "./types";
import type { useStoryClock } from "./useStoryClock";

export function StorySideActions({
  id,
  data,
  map,
  onMap,
  onRadar,
  clock,
  skyMode,
  setSkyMode,
  slice,
  setSlice,
}: {
  id: EarthStoryId;
  data: EarthStoryData;
  map: boolean;
  onMap: (map: boolean) => void;
  onRadar: () => void;
  clock: ReturnType<typeof useStoryClock>;
  skyMode: boolean;
  setSkyMode: (open: boolean) => void;
  slice: boolean;
  setSlice: (open: boolean) => void;
}) {
  if (id === "atmospheric-river")
    return (
      <div className="observatory-actions">
        <button type="button" onClick={onRadar}>
          View current Pacific radar
        </button>
        <p className="observation-note">Opens recent observed scans; radar time differs from the forecast.</p>
      </div>
    );
  if (data.sky)
    return (
      <div className="observatory-actions">
        <button
          type="button"
          aria-pressed={skyMode && !map}
          onClick={() => {
            clock.pause();
            if (!skyMode && id === "comet") {
              const visible = data.chapters.find((chapter) => chapter.label === "Above my horizon");
              if (visible) clock.seek(nearestFrame(data, visible.at));
            }
            onMap(false);
            setSkyMode(map || !skyMode);
          }}
        >
          {skyMode && !map ? "Back to Earth" : "See from my city"}
        </button>
      </div>
    );
  if (id === "dust")
    return (
      <DustSliceControls
        open={slice}
        toggle={() => {
          if (!slice) clock.seek(nearestFrame(data, Date.parse("2020-06-23T12:00:00Z")));
          else clock.pause();
          setSlice(!slice);
        }}
      />
    );
  return null;
}
