import { useLayoutEffect, useRef, type RefObject } from "react";
import { revealReadings } from "./presentationMotion";

export function useReadingArrival(
  panel: RefObject<HTMLElement>,
  key: string,
  motion: "drift" | "fade" = "drift",
) {
  const previous = useRef<{ key: string; panel: HTMLElement | null; animation: Animation | null }>({
    key,
    panel: null,
    animation: null,
  });
  useLayoutEffect(() => {
    if (previous.current.key === key) return;
    if (previous.current.panel !== panel.current) previous.current.animation?.cancel();
    previous.current = { key, panel: panel.current, animation: revealReadings(panel.current, motion) };
  }, [key, panel, motion]);
  useLayoutEffect(() => () => previous.current.animation?.cancel(), []);
}
