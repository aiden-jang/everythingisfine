import type { CameraState } from "./controls";

export function geographicCoordinates({ lon, lat }: Pick<CameraState, "lon" | "lat">): string {
  const wrap = ((((lon + 180) % 360) + 360) % 360) - 180;
  return `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? "S" : "N"} · ${Math.abs(wrap).toFixed(1)}° ${wrap < 0 ? "W" : "E"}`;
}

export function orbitCoordinates(state: CameraState): string {
  return `${geographicCoordinates(state)} · ${state.zoom.toFixed(2)}×`;
}

// Imperative text avoids a component render per camera frame; fading uses CSS, never another frame loop.
export function createOrbitReadout(node: HTMLElement | null) {
  let timer = 0,
    visible = false;
  return {
    show(): void {
      if (!node) return;
      visible = true;
      node.dataset["visible"] = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        visible = false;
        node.dataset["visible"] = "false";
      }, 1100);
    },
    update(state: CameraState): void {
      if (node && visible) node.textContent = orbitCoordinates(state);
    },
    dispose(): void {
      window.clearTimeout(timer);
    },
  };
}
