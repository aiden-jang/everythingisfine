import type { Controls } from "./controls";
import { positionEvidenceConnector } from "./evidenceConnector";

export function positionObservationAnchors(canvas: HTMLCanvasElement, controls: Controls, story = false) {
  const root = canvas.closest(".zones");
  const anchors = root?.querySelectorAll<HTMLElement>("[data-observation-anchor]");
  if (!anchors?.length) return;
  const occupied: { x: number; y: number }[] = [];
  let places = 0;
  const zoom = controls.state().zoom;
  const parents = new Map<Element, DOMRect>();
  const placeWidths = new Map<HTMLElement, number>();
  let evidenceSource: HTMLElement | undefined;
  for (const anchor of anchors) {
    if (anchor.dataset["evidenceSource"] === "true") evidenceSource ??= anchor;
    const parent = anchor.parentElement;
    if (parent && !parents.has(parent)) parents.set(parent, parent.getBoundingClientRect());
    if (!story && anchor.hasAttribute("data-place-label") && zoom >= Number(anchor.dataset["minZoom"])) {
      placeWidths.set(anchor, anchor.offsetWidth);
    }
  }
  const ordered = evidenceSource
    ? [evidenceSource, ...Array.from(anchors).filter((anchor) => anchor !== evidenceSource)]
    : anchors;
  for (const anchor of ordered) {
    const place = anchor.hasAttribute("data-place-label");
    if ((place && (story || places >= 5)) || zoom < Number(anchor.dataset["minZoom"] ?? 0)) {
      anchor.style.visibility = "hidden";
      continue;
    }
    const point = controls.project(Number(anchor.dataset["lon"]), Number(anchor.dataset["lat"]), 1.01);
    const parent = anchor.parentElement ? parents.get(anchor.parentElement) : undefined;
    const x = (point?.x ?? 0) - (parent?.left ?? 0);
    const y = (point?.y ?? 0) - (parent?.top ?? 0);
    const inset = Math.max(24, (placeWidths.get(anchor) ?? 0) / 2 + 4);
    const blockInset = anchor.hasAttribute("data-compact-anchor") ? 24 : 55;
    const visible =
      point &&
      parent &&
      x > inset &&
      x < parent.width - inset &&
      y > blockInset &&
      y < parent.height - blockInset &&
      !occupied.some((p) => Math.hypot(p.x - x, p.y - y) < (place ? 100 : 44));
    anchor.style.visibility = visible ? "visible" : "hidden";
    if (visible) {
      if (place) places++;
      occupied.push({ x, y });
      anchor.style.left = `${x}px`;
      anchor.style.top = `${y}px`;
    }
  }
  positionEvidenceConnector(canvas, controls, parents);
}
