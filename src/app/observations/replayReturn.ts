import type { ReplayProps } from "./RecordedReplay";

type ReplayCamera = Pick<ReplayProps, "map" | "onMap" | "readCamera" | "restoreCamera">;

export function captureReplayFrame(panel: ReplayCamera) {
  return {
    map: panel.map,
    camera: panel.readCamera?.(),
    scroll: document.getElementById("observatory-intro")?.scrollTop ?? 0,
    focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  };
}

export function restoreReplayFrame(
  saved: ReturnType<typeof captureReplayFrame> | undefined,
  panel: ReplayCamera,
  fallback: () => HTMLElement | null | undefined,
) {
  if (saved) panel.onMap(saved.map);
  requestAnimationFrame(() => {
    if (saved) {
      const intro = document.getElementById("observatory-intro");
      if (intro) intro.scrollTop = saved.scroll;
      if (saved.camera) panel.restoreCamera?.(saved.camera);
    }
    const target = saved?.focus;
    const usable =
      target?.isConnected &&
      target !== document.body &&
      target.getClientRects().length > 0 &&
      getComputedStyle(target).visibility === "visible";
    (usable ? target : fallback())?.focus({ preventScroll: true });
  });
}
