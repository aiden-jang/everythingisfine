import { useRef } from "react";
import type { ReplayProps } from "./RecordedReplay";
import { captureReplayFrame, restoreReplayFrame } from "./replayReturn";

type EarthView = Pick<ReplayProps, "map" | "onMap" | "readCamera" | "restoreCamera">;

export function useSkyReturn(view: EarthView) {
  const saved = useRef<{ frame: ReturnType<typeof captureReplayFrame>; time: number }>();
  const action = useRef<HTMLButtonElement>(null);
  return {
    action,
    capture(time: number) {
      saved.current = { frame: captureReplayFrame(view), time };
    },
    reset() {
      saved.current = undefined;
    },
    leave(select: (time: number) => void, projection?: boolean) {
      const earth = saved.current;
      saved.current = undefined;
      if (earth) select(earth.time);
      if (earth && (projection === undefined || earth.frame.map === projection))
        restoreReplayFrame(earth.frame, view, () => action.current);
      else if (projection !== undefined) view.onMap(projection);
    },
  };
}
