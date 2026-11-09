import { useEffect, useState } from "react";

const MOTION = "(prefers-reduced-motion: reduce)";
export const shadowMotion = () => matchMedia(MOTION).matches;

export function useShadowClock(
  start: number,
  end: number,
  ready: boolean,
  hold?: number,
  restored?: number,
  paused = false,
) {
  const [playing, setPlaying] = useState(() => !paused && !shadowMotion());
  const [at, setAt] = useState(Math.max(start, Math.min(end, restored ?? start)));

  useEffect(() => {
    const media = matchMedia(MOTION);
    const change = () => {
      if (media.matches) setPlaying(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!ready || !playing) return;
    let previous = performance.now();
    let waitUntil = 0;
    const speed = (end - start) / 15_000;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(160, now - previous);
      previous = now;
      if (document.hidden || now < waitUntil) return;
      setAt((current) => {
        if (current >= end) return current;
        const next = Math.min(end, current + elapsed * speed);
        if (hold !== undefined && current < hold && next >= hold) {
          waitUntil = now + 2200;
          return hold;
        }
        return next;
      });
    }, 80);
    return () => clearInterval(timer);
  }, [start, end, ready, playing, hold]);

  useEffect(() => {
    if (at >= end) setPlaying(false);
  }, [at, end]);

  return {
    at,
    playing,
    seek(value: number) {
      setPlaying(false);
      setAt(value);
    },
    toggle() {
      if (!playing && at >= end) setAt(start);
      setPlaying(!playing);
    },
    reset(value: number, play = false) {
      setPlaying(play);
      setAt(value);
    },
  };
}
