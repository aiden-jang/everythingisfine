import { useCallback, useEffect, useRef, useState } from "react";
import { ObservationDataError, type ObservationData, type ObservationSource } from "./types";
import { pollVisible } from "../pollVisible";

const OBSERVATION_TIMEOUT_MS = 24_000;

type Result = {
  data: ObservationData | null;
  state: "loading" | "ready" | "empty" | "failed";
  reason?: string;
  lastCheck?: number | undefined;
};

export function useObservationData(source: ObservationSource, option: string) {
  const cache = useRef(new Map<string, ObservationData>());
  const checked = useRef(new Map<string, number>());
  const [revision, retry] = useState(0);
  const [result, setResult] = useState<{ option: string; result: Result } | null>(null);
  useEffect(() => {
    return pollVisible(async (signal) => {
      const deadline = new AbortController();
      // Keep the deadline active through body reads and decoding, including multi-request sources.
      const timer = window.setTimeout(() => deadline.abort(), OBSERVATION_TIMEOUT_MS);
      const attempt = AbortSignal.any([signal, deadline.signal]);
      try {
        const data = await source.load(option, attempt);
        attempt.throwIfAborted();
        if (data.frames.length) cache.current.set(option, data);
        checked.current.set(option, Date.now());
        setResult({
          option,
          result: {
            data: cache.current.get(option) ?? null,
            state: data.frames.length ? "ready" : "empty",
            lastCheck: checked.current.get(option),
          },
        });
      } catch (error: unknown) {
        if (signal.aborted) return;
        const detail = error instanceof ObservationDataError ? { reason: error.message } : {};
        setResult({
          option,
          result: {
            data: cache.current.get(option) ?? null,
            state: "failed",
            lastCheck: checked.current.get(option),
            ...detail,
          },
        });
      } finally {
        window.clearTimeout(timer);
      }
    }, source.refreshMs);
  }, [source, option, revision]);
  const state =
    result?.option === option
      ? result.result
      : {
          data: cache.current.get(option) ?? null,
          state: "loading" as const,
          reason: undefined,
          lastCheck: checked.current.get(option),
        };
  const retrySource = useCallback(() => {
    setResult({
      option,
      result: {
        data: cache.current.get(option) ?? null,
        state: "loading",
        lastCheck: checked.current.get(option),
      },
    });
    retry((value) => value + 1);
  }, [option]);
  return { ...state, retry: retrySource };
}

export function useObservationImage(url: string | undefined, sequence?: string) {
  const [revision, setRevision] = useState(0);
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
  }, [url, sequence, revision]);
  const loaded = url ? cache.current.get(url) : undefined;
  const hold =
    url && sequence !== undefined && image?.last?.sequence === sequence ? image.last.element : null;
  return {
    element: loaded ?? hold,
    retry() {
      setImage(null);
      setRevision((n) => n + 1);
    },
    status: !url || loaded ? "ready" : image?.url === url && image.failed ? "failed" : "loading",
  } as const;
}
