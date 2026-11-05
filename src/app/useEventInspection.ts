import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaybackBoundary } from "./usePlaybackBoundary";
import type { WaveRun } from "./waveReplay";
import type { SequenceRun } from "./sequenceReplay";

export type InspectionRun = WaveRun | SequenceRun;
export type StartInspection = (run: InspectionRun, opener: HTMLButtonElement) => void;

export function useEventInspection(selected: string | null, enabled: boolean) {
  const [session, setSession] = useState<InspectionRun | null>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const run = enabled && session?.key === selected ? session : null;
  const close = useCallback((restoreFocus = false) => {
    setSession(null);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    if (!run) setSession(null);
  }, [run]);
  usePlaybackBoundary(run !== null, panel, trigger, close);

  return {
    run,
    panel,
    close,
    start: (next: InspectionRun, opener: HTMLButtonElement) => {
      trigger.current = opener;
      setSession(next);
    },
  };
}
