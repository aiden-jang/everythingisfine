import type { PerspectiveCamera } from "three";
import type { CameraState, Controls } from "./controls";

export function createRegionalFraming(camera: PerspectiveCamera, controls: Controls) {
  let from: CameraState;
  let to: CameraState;
  let fromLens = 1;
  let toLens = 1;
  let release = 0;
  let framed = false;
  function setLens(zoom: number): void {
    if (zoom === camera.zoom) return;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }
  return {
    aim(target: CameraState, lens: number): void {
      from = controls.state();
      const turn = ((((target.lon - from.lon + 180) % 360) + 360) % 360) - 180;
      to = { ...target, lon: from.lon + turn };
      fromLens = camera.zoom;
      toLens = lens;
      framed = false;
    },
    step(approach: number): void {
      if (framed) return;
      const t = approach ** 2 * (3 - 2 * approach);
      controls.setView({
        lon: from.lon + (to.lon - from.lon) * t,
        lat: from.lat + (to.lat - from.lat) * t,
        zoom: from.zoom + (to.zoom - from.zoom) * t,
      });
      setLens(fromLens + (toLens - fromLens) * t);
      framed = approach === 1;
    },
    release(): void {
      fromLens = camera.zoom;
      release = 0;
    },
    settle(dt: number, instant: boolean): boolean {
      if (camera.zoom === 1) return false;
      release = instant ? 1 : Math.min(1, release + dt / 0.35);
      setLens(1 + (fromLens - 1) * (1 - release) ** 3);
      return release < 1;
    },
  };
}
