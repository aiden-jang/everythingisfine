import { Vector3, type PerspectiveCamera } from "three";
import { DEG } from "../geo/sphere";
import type { TonightView } from "../geo/tonight";

export function createLocalSkyLabels(canvas: HTMLCanvasElement, up: Vector3) {
  const east = new Vector3();
  const north = new Vector3();
  const forward = new Vector3();
  const ray = new Vector3();
  const point = new Vector3();
  let labels: HTMLElement | null = null;

  return (camera: PerspectiveCamera, view: TonightView | null) => {
    if (!labels?.isConnected) {
      if (!view) return;
      labels = canvas.closest(".zones")?.querySelector<HTMLElement>("[data-sky-labels]") ?? null;
    }
    if (!labels) return;
    if (view) {
      const lon = view.city.lon * DEG;
      east.set(Math.cos(lon), 0, -Math.sin(lon));
      north.crossVectors(up, east);
      camera.getWorldDirection(forward);
    }
    const placed: { x: number; y: number }[] = [];
    const preferred = (label: HTMLElement) => Number(label.dataset["body"] === view?.targetName);
    const ordered = Array.from(labels.children) as HTMLElement[];
    ordered.sort((a, b) => preferred(b) - preferred(a));
    for (const label of ordered) {
      const body = view?.bodies.find(({ name }) => name === label.dataset["body"]);
      let visible = false;
      if (body && body.altitude > 0) {
        const bearing = body.azimuth * DEG;
        const altitude = body.altitude * DEG;
        const level = Math.cos(altitude);
        ray
          .copy(north)
          .multiplyScalar(level * Math.cos(bearing))
          .addScaledVector(east, level * Math.sin(bearing))
          .addScaledVector(up, Math.sin(altitude));
        point.copy(camera.position).addScaledVector(ray, 70).project(camera);
        const x = (point.x + 1) * 50;
        const y = (1 - point.y) * 50;
        visible =
          ray.dot(forward) > 0 &&
          x > 4 &&
          x < 87 &&
          y > 10 &&
          y < 88 &&
          !placed.some((previous) => Math.abs(previous.x - x) < 16 && Math.abs(previous.y - y) < 5);
        if (visible) {
          placed.push({ x, y });
          label.style.left = `${x}%`;
          label.style.top = `${y}%`;
        }
      }
      label.style.visibility = visible ? "visible" : "";
    }
  };
}
