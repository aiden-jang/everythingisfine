import { useEffect, useRef, useState, type RefObject } from "react";
import { radarCatalogUrl, radarImageUrl, radarScans, type RadarScan } from "../../sources/radar";

import { RAINVIEWER_CATALOGUE, rainviewerScans } from "../../sources/rainviewer";
import { forgetRainviewer, RainviewerConnectionError, rainviewerFetch } from "./rainviewerFetch";
import { globalRadarCoverage, globalRadarImage } from "./globalRadarImage";

const POLL_MS = 120_000;

interface RadarData {
  scans: RadarScan[];
  images: ReadonlyMap<number, ImageBitmap | null>;
  status: "loading" | "ready" | "empty" | "error";
  checkedAt: number;
  lastSuccess?: number | undefined;
  covers?: Awaited<ReturnType<typeof globalRadarCoverage>>["covers"] | undefined;
}

const fetchBounded = (url: string, signal: AbortSignal) =>
  fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(14_000)]) });

export function useRadarScans(
  held: RefObject<RadarScan | null>,
  global: boolean,
  showHistory: boolean,
  initialAt: number | undefined,
) {
  const [data, setData] = useState<RadarData>(() => ({
    scans: [],
    images: new Map(),
    status: "loading",
    checkedAt: Date.now(),
  }));
  const refresh = useRef(() => {});
  const loadOnDemand = useRef(() => {});
  const demand = useRef({ showHistory, initialAt });

  useEffect(() => {
    const images = new Map<number, ImageBitmap | null>();
    let coverage: Awaited<ReturnType<typeof globalRadarCoverage>> | undefined;
    let latestAt = 0;
    let timer = 0;
    let request: AbortController | null = null;
    let leaving = false;
    let deferredHistory = false;

    async function load() {
      if (document.hidden || leaving || request) return;
      window.clearTimeout(timer);
      deferredHistory = false;
      const current = new AbortController();
      const { signal } = current;
      request = current;
      try {
        let fresh: RadarScan[];
        if (global) {
          const catalogue = await rainviewerFetch(RAINVIEWER_CATALOGUE, signal, 60_000);
          fresh = rainviewerScans(JSON.parse(await catalogue.text()), Date.now());
        } else {
          const response = await fetchBounded(radarCatalogUrl(), signal);
          if (!response.ok) throw new Error("NOAA radar catalogue unavailable");
          fresh = radarScans(await response.json(), Date.now());
        }
        if (signal.aborted) return;
        if (!fresh.length) {
          setData((old) => ({ ...old, status: "empty", checkedAt: Date.now(), lastSuccess: Date.now() }));
          return;
        }
        const newest = fresh.at(-1)!;
        if (newest.at < latestAt) {
          setData((old) => ({ ...old, status: "error", checkedAt: Date.now() }));
          return;
        }
        latestAt = newest.at;
        const oldest = held.current;
        const scans =
          oldest && !fresh.some(({ id, at }) => id === oldest.id || at === oldest.at)
            ? [...fresh, oldest].sort((a, b) => a.at - b.at)
            : fresh;
        const queue = [newest, ...scans.filter(({ id }) => id !== newest.id)].filter(
          ({ id }) => !images.get(id),
        );
        function nextScan() {
          if (!global || queue[0]?.id === newest.id) return queue.shift();
          const { showHistory, initialAt } = demand.current;
          const selectedAt = held.current?.at ?? initialAt;
          const selected = queue.findIndex(({ at }) => at === selectedAt);
          const recent = queue.findIndex(({ id }) => id === fresh.at(-2)?.id);
          const index = selected >= 0 ? selected : recent >= 0 ? recent : showHistory ? 0 : -1;
          return index < 0 ? undefined : queue.splice(index, 1)[0];
        }
        if (global && queue.length && !coverage) coverage = await globalRadarCoverage(signal);
        if (signal.aborted) return;
        const keep = new Set(scans.map(({ id }) => id));
        for (const [id, image] of images) {
          if (!keep.has(id)) {
            image?.close();
            images.delete(id);
          }
        }
        for (const { id } of queue) images.delete(id);
        setData((old) => ({
          scans,
          images: new Map(images),
          status: "ready",
          covers: coverage?.covers ?? old.covers,
          checkedAt: Date.now(),
          lastSuccess: images.get(newest.id) ? Date.now() : old.lastSuccess,
        }));

        async function next() {
          for (let scan = nextScan(); scan && !signal.aborted; scan = nextScan()) {
            const { id } = scan;
            let image: ImageBitmap | null = null;
            let interrupted = false;
            try {
              if (coverage && scan.path) image = await globalRadarImage(scan.path, coverage.mask, signal);
              else {
                const png = await fetchBounded(radarImageUrl(id), signal);
                if (png.ok && png.headers.get("Content-Type")?.startsWith("image/"))
                  image = await createImageBitmap(await png.blob());
              }
            } catch (error) {
              interrupted = error instanceof RainviewerConnectionError;
            }
            if (signal.aborted) {
              image?.close();
              break;
            }
            images.set(id, image);
            // WebKit can cancel requests before dispatching pagehide on the old document.
            // A refused connection must not start a new batch for every remaining scan.
            if (interrupted) {
              for (const pending of queue) images.set(pending.id, null);
              queue.length = 0;
            }
            setData((old) => ({
              ...old,
              images: new Map(images),
              lastSuccess: id === newest.id && image ? Date.now() : old.lastSuccess,
            }));
            if (interrupted) break;
          }
        }
        await Promise.all(global ? [next()] : [next(), next(), next()]);
        if (!signal.aborted) deferredHistory = global && queue.length > 0;
      } catch {
        if (global && !signal.aborted) forgetRainviewer(RAINVIEWER_CATALOGUE);
        if (!signal.aborted) setData((old) => ({ ...old, status: "error", checkedAt: Date.now() }));
      } finally {
        if (request === current) {
          request = null;
          if (!document.hidden && !leaving) timer = window.setTimeout(() => void load(), POLL_MS);
        }
      }
    }

    function stop() {
      window.clearTimeout(timer);
      request?.abort();
      request = null;
    }
    function visibility() {
      if (document.hidden) stop();
      else void load();
    }
    function leave() {
      leaving = true;
      stop();
    }
    function returnToPage() {
      if (!leaving) return;
      leaving = false;
      void load();
    }

    refresh.current = () => {
      stop();
      if (global) forgetRainviewer(RAINVIEWER_CATALOGUE);
      void load();
    };
    loadOnDemand.current = () => {
      if (deferredHistory) void load();
    };
    void load();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", returnToPage);
    window.addEventListener("online", refresh.current);
    const online = refresh.current;
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", returnToPage);
      window.removeEventListener("online", online);
      for (const image of images.values()) image?.close();
      refresh.current = () => {};
      loadOnDemand.current = () => {};
    };
  }, [held, global]);
  useEffect(() => {
    const previous = demand.current;
    demand.current = { showHistory, initialAt };
    if (
      global &&
      (showHistory ? !previous.showHistory : initialAt !== undefined && initialAt !== previous.initialAt)
    )
      loadOnDemand.current();
  }, [global, showHistory, initialAt]);

  return { ...data, retry: () => refresh.current() };
}
