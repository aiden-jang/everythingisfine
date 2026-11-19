import { useEffect, useState } from "react";
import { fetchSpaceWeather, type SpaceSample } from "../../sources/spaceWeather";
import { pollVisible } from "../pollVisible";

const POLL = 120_000;
const TIMEOUT = 12_000;

export interface Readings<T> {
  points: readonly T[];
  status: "waiting" | "ok" | "empty" | "error";
  now: number;
}

export function useSpaceWeather<T extends SpaceSample>(
  url: string,
  decode: (payload: unknown, now: number) => T[],
): Readings<T> {
  const [data, setData] = useState<Readings<T>>(() => ({ points: [], status: "waiting", now: Date.now() }));

  useEffect(() => {
    const stop = pollVisible(
      (signal) =>
        fetchSpaceWeather(fetch, url, decode, AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]))
          .then((points) => {
            if (signal.aborted) return;
            setData((old) => {
              const latest = points.at(-1);
              const previous = old.points.at(-1);
              const newer = latest && (!previous || latest.at >= previous.at);
              return { points: newer ? points : old.points, status: newer ? "ok" : "empty", now: Date.now() };
            });
          })
          .catch(() => {
            if (!signal.aborted) setData((old) => ({ ...old, status: "error", now: Date.now() }));
          }),
      POLL,
    );
    function visibility() {
      if (!document.hidden) setData((old) => ({ ...old, now: Date.now() }));
    }
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [decode, url]);

  return data;
}
