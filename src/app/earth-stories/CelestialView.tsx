import { useMemo, useState } from "react";
import { sunElevation } from "../../geo/sun";
import { StoryProjection } from "../observations/StoryProjection";
import type { ReplayProps } from "../observations/RecordedReplay";
import type { ObservationFrame } from "../observations/types";
import type { StoryMoment } from "../observations/storyMoment";
import { useSkyReturn } from "../observations/useSkyReturn";
import { nearestFrame } from "./nearestFrame";
import type { EarthStoryData } from "./types";
import type { useStoryClock } from "./useStoryClock";

export function useArchiveSky(
  data: EarthStoryData,
  frame: ObservationFrame,
  initial: StoryMoment | undefined,
  panel: Pick<ReplayProps, "map" | "onMap" | "readCamera" | "restoreCamera">,
  clock: ReturnType<typeof useStoryClock>,
  orbital: boolean,
) {
  const { at } = frame;
  const [skyMode, setSkyMode] = useState(initial?.chapter === "sky");
  const earth = useSkyReturn(panel);
  const localSky = useMemo(
    () => (skyMode && !panel.map ? data.sky?.(at) : undefined),
    [skyMode, panel.map, data, at],
  );
  const body = localSky?.bodies.find((point) => point.name === localSky.targetName);
  const status =
    localSky && body && orbital
      ? `${body.name} · ${body.altitude > 0 ? "above horizon" : "below horizon"} · ${sunElevation(localSky.city.lon, localSky.city.lat, at) > -0.833 ? "daylight" : "Sun below horizon"}`
      : localSky && `${localSky.targetName} from ${localSky.city.name}`;
  const action = (
    <button
      type="button"
      ref={earth.action}
      onClick={() => {
        clock.pause();
        if (localSky) earth.leave((time) => clock.seek(nearestFrame(data, time)));
        else {
          earth.capture(at);
          panel.onMap(false);
        }
        setSkyMode(!localSky);
      }}
    >
      {localSky ? "Back to Earth" : "See from my city"}
    </button>
  );
  const sceneFrame = useMemo(
    () => (orbital && localSky ? { at, ...(frame.orbit?.eclipse ? { orbit: frame.orbit } : {}) } : frame),
    [at, frame, localSky, orbital],
  );
  return {
    sceneFrame,
    localSky,
    skyMode,
    setSkyMode,
    status,
    projection: !orbital ? undefined : localSky ? (
      <div className="story-projection">{action}</div>
    ) : (
      <StoryProjection map={panel.map} onMap={panel.onMap}>
        {action}
      </StoryProjection>
    ),
  };
}
