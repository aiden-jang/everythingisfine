import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaybackBoundary } from "./usePlaybackBoundary";
import { createWaveRun, type WaveRoute, type WaveRun } from "./waveReplay";

export function useWaveInspection(selected: string | null, enabled: boolean) {
  const [session, setSession] = useState<WaveRun | null>(null);
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
    start: (key: string, route: WaveRoute, opener: HTMLButtonElement) => {
      trigger.current = opener;
      setSession(createWaveRun(key, route));
    },
  };
}
