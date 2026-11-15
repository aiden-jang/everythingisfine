import type { WebGLRenderer } from "three";

type Bounds = { left: number; top: number; width: number; height: number };

export function visiblePixels(
  rect: Bounds,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  if (Math.min(rect.width, rect.height, size.width, size.height) <= 0) return null;
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewport.width, rect.left + rect.width);
  const bottom = Math.min(viewport.height, rect.top + rect.height);
  if (right <= left || bottom <= top) return null;
  const x = ((left - rect.left) / rect.width) * size.width;
  const y = ((rect.top + rect.height - bottom) / rect.height) * size.height;
  const width = ((right - left) / rect.width) * size.width;
  const height = ((bottom - top) / rect.height) * size.height;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.min(size.width, Math.ceil(x + width)) - Math.floor(x),
    height: Math.min(size.height, Math.ceil(y + height)) - Math.floor(y),
  };
}

export function createCanvasClip(
  renderer: Pick<WebGLRenderer, "setScissor" | "setScissorTest">,
  canvas: HTMLCanvasElement,
) {
  const stage = canvas.closest(".zone-canvas");
  return (full = false) => {
    // Captures and compositor-driven travel need pixels beyond the current screen edge.
    if (full || stage?.getAnimations?.().some((motion) => motion.playState === "running")) {
      renderer.setScissorTest(false);
      return true;
    }
    const size = { width: canvas.clientWidth, height: canvas.clientHeight };
    const clip = visiblePixels(canvas.getBoundingClientRect(), size, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (!clip) return false;
    const cropped = clip.width < size.width - 0.5 || clip.height < size.height - 0.5;
    renderer.setScissorTest(cropped);
    if (cropped) renderer.setScissor(clip.x, clip.y, clip.width, clip.height);
    return true;
  };
}
