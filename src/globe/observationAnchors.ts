import type { Controls } from "./controls";

export function positionObservationAnchors(canvas: HTMLCanvasElement, controls: Controls, story = false) {
  const root = canvas.closest(".zones");
  const anchors = root?.querySelectorAll<HTMLElement>("[data-observation-anchor]");
  if (!anchors?.length) return;
  const occupied: { x: number; y: number }[] = [];
  let places = 0;
  const zoom = controls.state().zoom;
  const parents = new Map<Element, DOMRect>();
  for (const anchor of anchors) {
    const parent = anchor.parentElement;
    if (parent && !parents.has(parent)) parents.set(parent, parent.getBoundingClientRect());
  }
  for (const anchor of anchors) {
    const place = anchor.hasAttribute("data-place-label");
    if ((place && (story || places >= 5)) || zoom < Number(anchor.dataset["minZoom"] ?? 0)) {
      anchor.style.visibility = "hidden";
      continue;
    }
    const point = controls.project(Number(anchor.dataset["lon"]), Number(anchor.dataset["lat"]), 1.01);
    const parent = anchor.parentElement ? parents.get(anchor.parentElement) : undefined;
    const x = (point?.x ?? 0) - (parent?.left ?? 0);
    const y = (point?.y ?? 0) - (parent?.top ?? 0);
    const visible =
      point &&
      parent &&
      x > 24 &&
      x < parent.width - 24 &&
      y > 55 &&
      y < parent.height - 55 &&
      !occupied.some((p) => Math.hypot(p.x - x, p.y - y) < (place ? 100 : 44));
    anchor.style.visibility = visible ? "visible" : "hidden";
    if (visible) {
      if (place) places++;
      occupied.push({ x, y });
      anchor.style.left = `${x}px`;
      anchor.style.top = `${y}px`;
    }
  }
}
