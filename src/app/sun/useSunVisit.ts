import { useRef, useState, type RefObject } from "react";
import type { AuroraRun } from "../../sources/auroraRoute";
import type { WindSample } from "../../sources/spaceWeather";

export function useSunVisit(
  before: () => void,
  changeRun: (update: (run: AuroraRun | null) => AuroraRun | null) => void,
) {
  const [visit, setVisit] = useState<{ sample: WindSample | undefined } | null>(null);
  return {
    visit,
    setVisit,
    sample: visit?.sample,
    open(sample?: WindSample) {
      before();
      changeRun((run) => (run ? { ...run, held: true } : null));
      setVisit({ sample });
    },
    close() {
      before();
      setVisit(null);
    },
  };
}

export function useOvalReturn(panel: RefObject<HTMLElement>, sun: { open: () => void; close: () => void }) {
  const scroll = useRef(0);
  return {
    open() {
      scroll.current = panel.current?.scrollTop ?? 0;
      sun.open();
    },
    close() {
      sun.close();
      requestAnimationFrame(() => {
        panel.current?.scrollTo(0, scroll.current);
        panel.current?.querySelector<HTMLButtonElement>("#visit-sun-watch")?.focus({ preventScroll: true });
      });
    },
  };
}
