import type { Controls } from "./controls";

export function positionObservationAnchors(canvas: HTMLCanvasElement, controls: Controls) {
  const root = canvas.closest(".zones");
  const anchors = root?.querySelectorAll<HTMLElement>("[data-observation-anchor]");
  if (!anchors?.length) return;
  const occupied: { x: number; y: number }[] = [];
  for (const anchor of anchors) {
    const point = controls.project(Number(anchor.dataset["lon"]), Number(anchor.dataset["lat"]), 1.01);
    const parent = anchor.parentElement?.getBoundingClientRect();
    const x = (point?.x ?? 0) - (parent?.left ?? 0);
    const y = (point?.y ?? 0) - (parent?.top ?? 0);
    const visible =
      point &&
      parent &&
      x > 24 &&
      x < parent.width - 24 &&
      y > 55 &&
      y < parent.height - 55 &&
      !occupied.some((p) => Math.hypot(p.x - x, p.y - y) < 44);
    anchor.style.visibility = visible ? "visible" : "hidden";
    if (visible) {
      occupied.push({ x, y });
      anchor.style.left = `${x}px`;
      anchor.style.top = `${y}px`;
    }
  }
}
