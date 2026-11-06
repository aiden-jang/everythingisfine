import { useEffect, useState } from "react";
import { fetchSpaceWeather, type SpaceSample } from "../../sources/spaceWeather";

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
    let timer = 0;
    let active: AbortController | null = null;
    let lastAttempt = -Infinity;

    function load() {
      if (document.hidden || active) return;
      window.clearTimeout(timer);
      const request = new AbortController();
      active = request;
      lastAttempt = Date.now();
      const timeout = window.setTimeout(() => request.abort(), TIMEOUT);
      void fetchSpaceWeather(fetch, url, decode, request.signal)
        .then((points) => {
          if (active !== request) return;
          setData((old) => {
            const latest = points.at(-1);
            const previous = old.points.at(-1);
            const newer = latest && (!previous || latest.at >= previous.at);
            return { points: newer ? points : old.points, status: newer ? "ok" : "empty", now: Date.now() };
          });
        })
        .catch(() => {
          if (active === request) setData((old) => ({ ...old, status: "error", now: Date.now() }));
        })
        .finally(() => {
          window.clearTimeout(timeout);
          if (active !== request) return;
          active = null;
          if (!document.hidden) timer = window.setTimeout(load, POLL);
        });
    }

    function visibility() {
      window.clearTimeout(timer);
      if (document.hidden) {
        const request = active;
        active = null;
        if (request) lastAttempt = -Infinity;
        request?.abort();
        return;
      }
      setData((old) => ({ ...old, now: Date.now() }));
      const delay = POLL - (Date.now() - lastAttempt);
      if (delay > 0) timer = window.setTimeout(load, delay);
      else load();
    }

    load();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      const request = active;
      active = null;
      request?.abort();
    };
  }, [decode, url]);

  return data;
}
