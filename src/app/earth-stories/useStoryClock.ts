import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function useStoryClock(
  count: number,
  initial: number,
  waiting: RefObject<boolean>,
  restored: boolean,
) {
  const [position, setPosition] = useState(initial);
  const [playing, setPlaying] = useState(
    !restored && !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [cinematic, setCinematic] = useState(!restored);
  const clock = useRef(position);
  clock.current = position;
  useEffect(() => {
    if (!playing || count < 2) return;
    let request = 0;
    let previous: number | undefined;
    let readout = 0;
    function tick(now: number) {
      const dt = previous === undefined ? 0 : Math.min(100, now - previous);
      previous = now;
      if (!waiting.current)
        clock.current = Math.min(
          count - 1,
          clock.current + (dt * (count - 1)) / Math.min(24000, Math.max(6000, count * 900)),
        );
      if (now - readout >= 65 || clock.current === count - 1) {
        setPosition(clock.current);
        readout = now;
      }
      if (clock.current < count - 1) request = requestAnimationFrame(tick);
      else setPlaying(false);
    }
    function visibility() {
      cancelAnimationFrame(request);
      previous = undefined;
      if (!document.hidden) request = requestAnimationFrame(tick);
    }
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [count, playing, waiting]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (media.matches) {
        setPlaying(false);
        setCinematic(false);
      }
    };
    media.addEventListener("change", stop);
    return () => media.removeEventListener("change", stop);
  }, []);
  const pause = useCallback(() => {
    setPlaying(false);
    setCinematic(false);
  }, []);
  return {
    position,
    playing,
    cinematic,
    seek(index: number) {
      setPlaying(false);
      setCinematic(false);
      setPosition(Math.max(0, Math.min(count - 1, index)));
    },
    pause,
    resume() {
      setCinematic(!matchMedia("(prefers-reduced-motion: reduce)").matches);
      setPlaying(clock.current < count - 1);
    },
    replay() {
      setPosition(0);
      setCinematic(!matchMedia("(prefers-reduced-motion: reduce)").matches);
      setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    },
    toggle() {
      if (!playing && position >= count - 1) {
        setPosition(0);
        setCinematic(!matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
      setPlaying(!playing);
    },
  };
}
