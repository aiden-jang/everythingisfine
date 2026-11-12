import { useEffect, useRef, useState, type RefObject } from "react";
import { radarCatalogUrl, radarImageUrl, radarScans, type RadarScan } from "../../sources/radar";

import { RAINVIEWER_CATALOGUE, rainviewerScans } from "../../sources/rainviewer";
import { forgetRainviewer, rainviewerFetch } from "./rainviewerFetch";
import { globalRadarImage } from "./globalRadarImage";

const POLL_MS = 120_000;

interface RadarData {
  scans: RadarScan[];
  images: ReadonlyMap<number, ImageBitmap | null>;
  status: "loading" | "ready" | "empty" | "error";
  checkedAt: number;
  lastSuccess?: number | undefined;
}

const fetchBounded = (url: string, signal: AbortSignal) =>
  fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(14_000)]) });

export function useRadarScans(held: RefObject<RadarScan | null>, global: boolean) {
  const [data, setData] = useState<RadarData>(() => ({
    scans: [],
    images: new Map(),
    status: "loading",
    checkedAt: Date.now(),
  }));
  const refresh = useRef(() => {});

  useEffect(() => {
    const images = new Map<number, ImageBitmap | null>();
    let latestAt = 0;
    let timer = 0;
    let request: AbortController | null = null;

    async function load() {
      if (document.hidden || request) return;
      window.clearTimeout(timer);
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
        const keep = new Set(scans.map(({ id }) => id));
        for (const [id, image] of images) {
          if (!keep.has(id)) {
            image?.close();
            images.delete(id);
          }
        }
        const queue = [newest, ...scans.filter(({ id }) => id !== newest.id)].filter(
          ({ id }) => !images.get(id),
        );
        for (const { id } of queue) images.delete(id);
        setData((old) => ({
          scans,
          images: new Map(images),
          status: "ready",
          checkedAt: Date.now(),
          lastSuccess: images.get(newest.id) ? Date.now() : old.lastSuccess,
        }));

        async function next() {
          for (let scan = queue.shift(); scan && !signal.aborted; scan = queue.shift()) {
            const { id } = scan;
            let image: ImageBitmap | null = null;
            try {
              if (global && scan.path) image = await globalRadarImage(scan.path, signal);
              else {
                const png = await fetchBounded(radarImageUrl(id), signal);
                if (png.ok && png.headers.get("Content-Type")?.startsWith("image/"))
                  image = await createImageBitmap(await png.blob());
              }
            } catch {
              // The timestamp remains selectable when its image cannot be read.
            }
            if (signal.aborted) {
              image?.close();
              break;
            }
            images.set(id, image);
            setData((old) => ({
              ...old,
              images: new Map(images),
              lastSuccess: id === newest.id && image ? Date.now() : old.lastSuccess,
            }));
          }
        }
        await Promise.all(global ? [next()] : [next(), next(), next()]);
      } catch {
        if (global && !signal.aborted) forgetRainviewer(RAINVIEWER_CATALOGUE);
        if (!signal.aborted) setData((old) => ({ ...old, status: "error", checkedAt: Date.now() }));
      } finally {
        if (request === current) {
          request = null;
          if (!document.hidden) timer = window.setTimeout(() => void load(), POLL_MS);
        }
      }
    }

    function visibility() {
      window.clearTimeout(timer);
      if (document.hidden) {
        request?.abort();
        request = null;
      } else {
        void load();
      }
    }

    refresh.current = () => {
      request?.abort();
      request = null;
      if (global) forgetRainviewer(RAINVIEWER_CATALOGUE);
      void load();
    };
    void load();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      const current = request;
      request = null;
      current?.abort();
      for (const image of images.values()) image?.close();
      refresh.current = () => {};
    };
  }, [held, global]);

  return { ...data, retry: () => refresh.current() };
}
