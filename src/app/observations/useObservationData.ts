import { useEffect, useRef, useState } from "react";
import { ObservationDataError, type ObservationData, type ObservationSource } from "./types";

type Result = {
  data: ObservationData | null;
  state: "loading" | "ready" | "empty" | "failed";
  reason?: string;
};

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
        .catch((error: unknown) => {
          if (abort.signal.aborted) return;
          const detail = error instanceof ObservationDataError ? { reason: error.message } : {};
          setResult({
            option,
            result: { data: cache.current.get(option) ?? null, state: "failed", ...detail },
          });
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
      : { data: cache.current.get(option) ?? null, state: "loading" as const, reason: undefined };
  return {
    ...state,
    retry() {
      setResult({ option, result: { data: cache.current.get(option) ?? null, state: "loading" } });
      retry((value) => value + 1);
    },
  };
}

export function useObservationImage(url: string | undefined, sequence?: string) {
  const [image, setImage] = useState<{
    url: string;
    failed: boolean;
    last?: { sequence: string; element: HTMLImageElement };
  } | null>(null);
  const cache = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    if (!url || cache.current.has(url)) return;
    const element = new Image();
    if (sequence === undefined) element.crossOrigin = "anonymous";
    const failed = () => {
      window.clearTimeout(timeout);
      setImage((previous) => ({ ...previous, url, failed: true }));
    };
    const timeout = window.setTimeout(failed, 10_000);
    element.onload = () => {
      window.clearTimeout(timeout);
      if (cache.current.size >= 8) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(url, element);
      setImage({ url, failed: false, ...(sequence !== undefined ? { last: { sequence, element } } : {}) });
    };
    element.onerror = failed;
    element.src = url;
    return () => {
      window.clearTimeout(timeout);
      element.onload = element.onerror = null;
      if (!element.complete) element.removeAttribute("src");
    };
  }, [url, sequence]);
  const loaded = url ? cache.current.get(url) : undefined;
  const hold =
    url && sequence !== undefined && image?.last?.sequence === sequence ? image.last.element : null;
  return {
    element: loaded ?? hold,
    status: !url || loaded ? "ready" : image?.url === url && image.failed ? "failed" : "loading",
  } as const;
}
