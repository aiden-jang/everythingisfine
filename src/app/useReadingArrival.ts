import { useLayoutEffect, useRef, type RefObject } from "react";
import { revealReadings } from "./presentationMotion";

export function useReadingArrival(panel: RefObject<HTMLElement>, key: string) {
  const previous = useRef(key);
  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    const animation = revealReadings(panel.current);
    return () => animation?.cancel();
  }, [key, panel]);
}
