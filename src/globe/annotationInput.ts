import type { Controls } from "./controls";

type AnnotationInput = { lon: number; lat: number } | { camera: "hold" | "resume" };

export function refreshAnnotations(point?: AnnotationInput) {
  document
    .querySelector("#globe-view canvas")
    ?.dispatchEvent(new CustomEvent("scene-annotation", { detail: point }));
}

export function attachAnnotations(canvas: HTMLCanvasElement, controls: Controls, wake: () => void) {
  const update = (event: Event) => {
    const point = (event as CustomEvent<AnnotationInput | undefined>).detail;
    if (point && "camera" in point) {
      if (point.camera === "hold") controls.guidance.interrupt();
      else controls.guidance.recenter();
    } else if (point && Number.isFinite(point.lon) && Number.isFinite(point.lat)) {
      controls.guidance.interrupt();
      controls.flyTo(point.lon, point.lat, Math.max(1.4, Math.min(3, controls.state().zoom)));
    }
    wake();
  };
  canvas.addEventListener("scene-annotation", update);
  return () => canvas.removeEventListener("scene-annotation", update);
}
