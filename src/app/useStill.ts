import { useCallback, useRef, useState } from "react";
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
  // Read current displayed counts without recreating the capture callback on every tick.
  const stillCounts = useRef({ quakes: 0, cyclones: 0, fires: 0, firesCapped: false, floods: 0 });
  const saveStill = useCallback(() => {
    const source = capture.current();
    if (!source) return;
    const frame = document.createElement("canvas");
    frame.width = STILL_WIDTH;
    frame.height = STILL_HEIGHT;
    const ctx = frame.getContext("2d");
    if (!ctx) return;
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
    const file = new File([bytes], name, { type: "image/png" });

    /*
     * The share sheet where there is one, a download where there is not. A phone cannot do anything useful
     * with `a.download`, which is where this picture is most worth having: it is the whole way the app
     * travels from somebody's screen into a conversation.
     */
    const share = navigator.share !== undefined && (navigator.canShare?.({ files: [file] }) ?? false);
    if (share) {
      setSaving(true);
      // A dismissed sheet rejects with AbortError. That is somebody changing their mind, not a failure.
      void navigator
        .share({ files: [file] })
        .catch(() => {})
        .finally(() => setSaving(false));
      return;
    }
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  }, [feed, filters.minMagnitude, filters.windowMs, cursor, ramp]);
  return { saving, stillCounts, saveStill, onCapture };
}
