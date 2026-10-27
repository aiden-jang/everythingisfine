import { useCallback, useEffect, useRef, useState } from "react";
import { downloadStill } from "./stillDelivery";
import { drawStill, stillMoment, verdictLine, STILL_HEIGHT, STILL_WIDTH } from "./still";
import { compactSpan } from "./format";
import type { Feed } from "./feed";
import type { Filters } from "../data/types";
import type { RampName } from "../globe/ramp";

export function useStill(feed: Feed, filters: Filters, ramp: RampName, cursor: number | null) {
  const capture = useRef<() => HTMLCanvasElement | null>(() => null);
  const onCapture = useCallback((fn: () => HTMLCanvasElement | null) => {
    capture.current = fn;
  }, []);
  /* Keep everything between the capture and the `drawImage` synchronous: the globe's drawing buffer is
  gone the moment the browser composites. */
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallback, setFallback] = useState<File | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Read current displayed counts without recreating the capture callback on every tick.
  const stillCounts = useRef({ quakes: 0, cyclones: 0, fires: 0, firesCapped: false, floods: 0 });
  const saveStill = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    setFallback(null);
    let file: File | null = null;
    const failed = (): void => {
      if (!alive.current) return;
      setFallback(file);
      setNotice(
        file
          ? "Sharing is unavailable. You can download the image."
          : "The globe is not ready. Try again after it appears.",
      );
    };
    const finished = (): void => {
      busy.current = false;
      if (alive.current) setSaving(false);
    };
    try {
      const source = capture.current();
      if (!source) throw new Error("Globe unavailable");
      const frame = document.createElement("canvas");
      frame.width = STILL_WIDTH;
      frame.height = STILL_HEIGHT;
      const ctx = frame.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const style = getComputedStyle(document.documentElement);
      const token = (name: string): string => style.getPropertyValue(`--color-${name}`).trim();
      drawStill(
        ctx,
        source,
        source.width,
        source.height,
        {
          // An archive ends at the next midnight; its caption belongs to the day's start.
          moment: stillMoment(
            cursor,
            feed.snapshot().archive?.from ?? Date.now(),
            feed.snapshot().archive !== null,
          ),
          // From `onGlobe`, not the raw feeds, or a still of an archived day counts layers it does not show.
          verdict: verdictLine(stillCounts.current),
          // Caption the requested span even while its feeds are still filling.
          filter: `M${filters.minMagnitude.toFixed(1)}+ · last ${compactSpan(filters.windowMs)}`,
          host: window.location.host,
        },
        { background: token("void"), ink: token("ink"), faint: token("faint"), ramp },
      );

      /*
       * Encoded synchronously, through `toDataURL` rather than `toBlob`.
       *
       * `navigator.share` needs the user gesture that started this to still be live, and `toBlob` hands its
       * result back in a later task - long enough on a phone for the activation to lapse and the share to be
       * refused. This blocks for a few tens of milliseconds and keeps the gesture.
       */
      const name = `everything-is-fine-${new Date(cursor ?? Date.now())
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19)}.png`;
      const url = frame.toDataURL("image/png");
      const bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
      file = new File([bytes], name, { type: "image/png" });

      // Prefer native sharing; keep the rendered file available if the sheet refuses it.
      let share = false;
      try {
        share = navigator.share !== undefined && (navigator.canShare?.({ files: [file] }) ?? false);
      } catch {
        /* A capability probe can be refused independently of downloads. */
      }
      if (share) {
        setSaving(true);
        // A dismissed sheet rejects with AbortError. That is somebody changing their mind, not a failure.
        void navigator
          .share({ files: [file] })
          .catch((error: unknown) => {
            if (!(error instanceof DOMException && error.name === "AbortError")) failed();
          })
          .finally(finished);
        return;
      }
      downloadStill(file);
      finished();
    } catch {
      failed();
      finished();
    }
  }, [feed, filters.minMagnitude, filters.windowMs, cursor, ramp]);
  const dismiss = (): void => {
    setNotice(null);
    setFallback(null);
  };
  const download = fallback
    ? (): void => {
        try {
          downloadStill(fallback);
          setNotice("Image downloaded.");
        } catch {
          setNotice("The download could not start. Try again.");
        }
      }
    : null;
  return { saving, stillCounts, saveStill, onCapture, notice, download, dismiss };
}
