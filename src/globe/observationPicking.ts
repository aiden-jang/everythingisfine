import type { ObservationView } from "../app/observations/types";
import type { Controls } from "./controls";
import { createTapGesture } from "./tapGesture";

export function createObservationPicking(canvas: HTMLCanvasElement, controls: Controls) {
  let pick: ObservationView["onPick"];
  let sphere = false;
  const tap = createTapGesture();
  const down = (event: PointerEvent) => {
    if (!pick || event.button !== 0 || (!sphere && controls.morph() !== 1)) return;
    tap.down(event);
  };
  const up = (event: PointerEvent) => {
    if (!tap.up(event) || !pick || (!sphere && controls.morph() !== 1)) return;
    const point = controls.pick(event.clientX, event.clientY);
    event.preventDefault();
    if (point) pick(point);
  };
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointermove", tap.move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", tap.cancel);
  return {
    set(view: ObservationView | null) {
      pick = view?.onPick;
      sphere = view?.pickOnGlobe ?? false;
    },
    dispose() {
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", tap.move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", tap.cancel);
    },
  };
}
