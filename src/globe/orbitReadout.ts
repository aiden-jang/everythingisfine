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
  const untrack = trackHudOffset(node?.parentElement ?? null);
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
      untrack();
    },
  };
}

// Both overlays follow the real header, including its narrow-phone wrap and folded state.
function trackHudOffset(root: HTMLElement | null): () => void {
  const header = document.getElementById("chrome-head");
  if (!root || !header) return () => {};
  const update = (): void => {
    const top = Math.max(16, header.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 16);
    root.style.setProperty("--scene-hud-top", `${top}px`);
  };
  const observer = new ResizeObserver(update);
  observer.observe(header);
  observer.observe(root);
  update();
  return () => observer.disconnect();
}
