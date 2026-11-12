export function watchGraphics(canvas: HTMLCanvasElement, lost: () => void, restored: () => void): () => void {
  const onLost = (event: Event) => {
    event.preventDefault();
    lost();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", restored);
  };
}

export function restoreGraphics(canvas: HTMLCanvasElement | null): boolean {
  const context = canvas?.getContext("webgl2");
  const recovery = context?.getExtension("WEBGL_lose_context");
  if (!recovery || !context?.isContextLost()) return false;
  recovery.restoreContext();
  return true;
}
