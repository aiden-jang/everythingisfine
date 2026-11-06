import { useEffect, useRef, useState } from "react";
import type { ObservationData, ObservationSource } from "./types";

type Result = { data: ObservationData | null; state: "loading" | "ready" | "empty" | "failed" };

export function useObservationData(source: ObservationSource, option: string) {
  const cache = useRef(new Map<string, ObservationData>());
  const [revision, retry] = useState(0);
  const [result, setResult] = useState<{ option: string; result: Result } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let timer = 0;
    function start() {
      void source
        .load(option, abort.signal)
        .then((data) => {
          if (abort.signal.aborted) return;
          if (data.frames.length) cache.current.set(option, data);
          setResult({
            option,
            result: {
              data: cache.current.get(option) ?? null,
              state: data.frames.length ? "ready" : "empty",
            },
          });
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setResult({ option, result: { data: cache.current.get(option) ?? null, state: "failed" } });
        })
        .finally(() => {
          if (!abort.signal.aborted && source.refreshMs) timer = window.setTimeout(tick, source.refreshMs);
        });
    }
    function tick() {
      if (document.hidden) document.addEventListener("visibilitychange", visible);
      else start();
    }
    function visible() {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", visible);
      start();
    }
    start();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [source, option, revision]);
  const state =
    result?.option === option
      ? result.result
      : { data: cache.current.get(option) ?? null, state: "loading" as const };
  return {
    ...state,
    retry() {
      setResult({ option, result: { data: cache.current.get(option) ?? null, state: "loading" } });
      retry((value) => value + 1);
    },
  };
}

export function useObservationImage(url: string | undefined) {
  const [image, setImage] = useState<{ url: string; element: HTMLImageElement | null } | null>(null);
  const cache = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    if (!url || cache.current.has(url)) return;
    const element = new Image();
    element.crossOrigin = "anonymous";
    const failed = () => {
      window.clearTimeout(timeout);
      setImage({ url, element: null });
    };
    const timeout = window.setTimeout(failed, 10_000);
    element.onload = () => {
      window.clearTimeout(timeout);
      if (cache.current.size >= 8) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(url, element);
      setImage({ url, element });
    };
    element.onerror = failed;
    element.src = url;
    return () => {
      window.clearTimeout(timeout);
      element.onload = element.onerror = null;
      if (!element.complete) element.removeAttribute("src");
    };
  }, [url]);
  return {
    element: url ? (cache.current.get(url) ?? null) : null,
    status: !url || cache.current.has(url) ? "ready" : image?.url === url ? "failed" : "loading",
  } as const;
}
