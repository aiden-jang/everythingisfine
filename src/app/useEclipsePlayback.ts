import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CameraState } from "../globe/controls";
import { eclipseFrame, progressAt } from "./eclipseReplay";
import { usePlaybackBoundary } from "./usePlaybackBoundary";
import type { Scrub } from "./scrub";

const RUN_MS = 8_000;
const MOTION = "(prefers-reduced-motion: reduce)";

interface Session {
  from: CameraState;
  progress: number;
  playing: boolean;
  reduced: boolean;
}

export function useEclipsePlayback(enabled: boolean, setScrub: (scrub: Scrub) => void) {
  const [session, setSession] = useState<Session | null>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const active = enabled && session !== null;
  const playing = active && session.playing;
  const frame = useMemo(
    () => (enabled && session ? eclipseFrame(session.progress, session.from, session.reduced) : null),
    [enabled, session],
  );
  const displayedAt = useRef<number | null>(null);
  displayedAt.current = frame?.at ?? null;

  const start = (from: CameraState, opener: HTMLButtonElement) => {
    if (!enabled || active) return;
    trigger.current = opener;
    const reduced = matchMedia(MOTION).matches;
    const progress = reduced ? progressAt(0.5) : 0;
    setScrub({ at: eclipseFrame(progress, from, reduced).at, playing: false });
    setSession({ from, progress, reduced, playing: !reduced });
  };
  const close = useCallback(
    (restoreFocus = false) => {
      setSession(null);
      if (displayedAt.current !== null) setScrub({ at: displayedAt.current, playing: false });
      if (restoreFocus) trigger.current?.focus({ preventScroll: true });
    },
    [setScrub],
  );

  useEffect(() => {
    if (!enabled) setSession(null);
  }, [enabled]);

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    const reset = () => {
      previous = performance.now();
    };
    document.addEventListener("visibilitychange", reset);
    const timer = window.setInterval(() => {
      const tick = performance.now();
      const dt = tick - previous;
      previous = tick;
      if (document.hidden) return;
      setSession((current) => {
        if (!current?.playing) return current;
        const progress = Math.min(1, current.progress + dt / RUN_MS);
        return { ...current, progress, playing: progress < 1 };
      });
    }, 50);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [playing]);

  useEffect(() => {
    if (!active) return;
    const motion = matchMedia(MOTION);
    const changeMotion = () => {
      setSession((current) => current && { ...current, reduced: motion.matches, playing: false });
    };
    motion.addEventListener("change", changeMotion);
    return () => motion.removeEventListener("change", changeMotion);
  }, [active]);
  usePlaybackBoundary(active, panel, trigger, close);

  return {
    frame,
    panel,
    playing,
    progress: session?.progress ?? 0,
    start,
    close,
    seek: (fraction: number) =>
      setSession((current) => current && { ...current, progress: progressAt(fraction), playing: false }),
    toggle: () =>
      setSession(
        (current) =>
          current &&
          (current.progress === 1
            ? {
                ...current,
                from: eclipseFrame(1, current.from, current.reduced).camera,
                progress: current.reduced ? progressAt(0) : 0,
                playing: true,
              }
            : { ...current, playing: !current.playing }),
      ),
  };
}
