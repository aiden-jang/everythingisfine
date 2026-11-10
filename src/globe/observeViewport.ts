export function observeViewport(
  canvas: HTMLCanvasElement,
  globe: { resize: () => void },
  redraw: () => void,
  wake: () => void,
  sleep: () => void,
): () => void {
  const visibility = () => (document.hidden ? sleep() : wake());
  document.addEventListener("visibilitychange", visibility);
  const observer = new ResizeObserver(() => {
    globe.resize();
    redraw();
  });
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", visibility);
  };
}
