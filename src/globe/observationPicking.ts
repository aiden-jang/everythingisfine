import type { ObservationView } from "../app/observations/types";
import type { Controls } from "./controls";

export function createObservationPicking(canvas: HTMLCanvasElement, controls: Controls) {
  let pick: ObservationView["onPick"];
  const down = (event: PointerEvent) => {
    if (!pick || event.button !== 0 || controls.morph() !== 1) return;
    const point = controls.pick(event.clientX, event.clientY);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (point) pick(point);
  };
  canvas.addEventListener("pointerdown", down, true);
  return {
    set(view: ObservationView | null) {
      pick = view?.onPick;
    },
    dispose() {
      canvas.removeEventListener("pointerdown", down, true);
    },
  };
}
