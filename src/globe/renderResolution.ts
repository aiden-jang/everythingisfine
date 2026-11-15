import type { WebGLRenderer } from "three";
import { createFrameBudget } from "./frameBudget";
import { createCanvasClip } from "./visibleCanvas";

export function createRenderResolution(
  renderer: WebGLRenderer,
  markers: readonly { setPixelRatio: (ratio: number) => void }[],
  canvas: HTMLCanvasElement,
) {
  const clip = createCanvasClip(renderer, canvas);
  const budget = createFrameBudget();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0;
  function apply() {
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) * budget.scale());
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    for (const marker of markers) marker.setPixelRatio(ratio);
  }
  return {
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
      apply();
    },
    frame(full = false) {
      if (width && height && budget.sample(performance.now(), reduced.matches, document.hidden)) apply();
      return clip(full);
    },
  };
}
