import { Vector3, type PerspectiveCamera } from "three";
import { DEG } from "../geo/sphere";
import type { SkyLook, TonightView } from "../geo/tonight";

export function createLocalSkyLabels(canvas: HTMLCanvasElement, up: Vector3) {
  const east = new Vector3();
  const north = new Vector3();
  const forward = new Vector3();
  const ray = new Vector3();
  const point = new Vector3();
  let labels: HTMLElement | null = null;

  function project(camera: PerspectiveCamera, look: SkyLook) {
    const bearing = look.azimuth * DEG;
    const altitude = look.altitude * DEG;
    const level = Math.cos(altitude);
    ray
      .copy(north)
      .multiplyScalar(level * Math.cos(bearing))
      .addScaledVector(east, level * Math.sin(bearing))
      .addScaledVector(up, Math.sin(altitude));
    if (ray.dot(forward) < 0.1) return null;
    point.copy(camera.position).addScaledVector(ray, 70).project(camera);
    return { x: (point.x + 1) * 50, y: (1 - point.y) * 50 };
  }

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
      const arc = labels.parentElement?.querySelector("[data-radiant-arc]");
      if (arc) {
        let path = "";
        let joined = false;
        for (const look of view.radiantTrail ?? []) {
          const at = look.altitude > 0 ? project(camera, look) : null;
          if (at) path += `${joined ? "L" : "M"}${at.x.toFixed(2)} ${at.y.toFixed(2)} `;
          joined = at !== null;
        }
        arc.setAttribute("d", path);
      }
    }
    const placed: { x: number; y: number }[] = [];
    const preferred = (label: HTMLElement) => Number(label.dataset["body"] === view?.targetName);
    const ordered = Array.from(labels.children) as HTMLElement[];
    ordered.sort((a, b) => preferred(b) - preferred(a));
    for (const label of ordered) {
      const body = view?.bodies.find(({ name }) => name === label.dataset["body"]);
      let visible = false;
      if (body && body.altitude > 0) {
        const at = project(camera, body);
        const { x, y } = at ?? { x: 0, y: 0 };
        visible =
          at !== null &&
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
