import { useCallback, useRef } from "react";
import { reportAnalytics } from "../../analytics/browser";
type Frame = { at: number; revealed: number } | null;
/** Report a replay's start once; animation frames are not separate uses. */
export function useReplayAnalytics(onFrame: (frame: Frame) => void) {
  const active = useRef(false);
  return useCallback(
    (frame: Frame) => {
      if (frame && !active.current) reportAnalytics({ name: "replay_started" });
      active.current = frame !== null;
      onFrame(frame);
    },
    [onFrame],
  );
}
