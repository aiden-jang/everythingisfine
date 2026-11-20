import type { ObservationView } from "../app/observations/types";
import type { Controls } from "./controls";
import { projectionMoving } from "./morph";
import { createTapGesture } from "./tapGesture";

export function createObservationPicking(canvas: HTMLCanvasElement, controls: Controls) {
  let pick: ObservationView["onPick"];
  let marks: ObservationView["pickMarks"];
  let sphere = false;
  let hovered = false;
  const tap = createTapGesture();
  const active = () =>
    !projectionMoving(controls.morph()) && (!!marks || (!!pick && (sphere || controls.morph() === 1)));
  const markAt = (event: PointerEvent) => {
    if (!marks || !active()) return -1;
    const box = canvas.getBoundingClientRect();
    let nearest = -1;
    let distance = event.pointerType === "touch" ? 24 : 17;
    marks.points.forEach(({ lon, lat, lift }, index) => {
      const point = controls.project(lon, lat, 1 + (lift ?? 0.012), box);
      if (!point) return;
      const away = Math.hypot(event.clientX - point.x, event.clientY - point.y);
      if (away >= distance) return;
      distance = away;
      nearest = index;
    });
    return nearest;
  };
  const down = (event: PointerEvent) => {
    if (active() && event.button === 0) tap.down(event);
  };
  const setHover = (next: boolean) => {
    if (hovered !== next) canvas.toggleAttribute("data-observation-mark-hover", next);
    hovered = next;
  };
  const clearHover = () => setHover(false);
  const move = (event: PointerEvent) => {
    const dragging = tap.move(event);
    if (marks && event.pointerType === "mouse") {
      setHover(!dragging && markAt(event) >= 0);
    }
  };
  const up = (event: PointerEvent) => {
    if (!tap.up(event) || !active()) return;
    const index = markAt(event);
    if (marks && index >= 0) {
      event.preventDefault();
      marks.select(index);
      return;
    }
    if (!pick) return;
    const point = controls.pick(event.clientX, event.clientY);
    event.preventDefault();
    if (point) pick(point);
  };
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", clearHover);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", tap.cancel);
  return {
    set(view: ObservationView | null) {
      pick = view?.onPick;
      marks = view?.pickMarks;
      sphere = view?.pickOnGlobe ?? false;
      if (!marks) clearHover();
    },
    dispose() {
      clearHover();
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", clearHover);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", tap.cancel);
    },
  };
}
