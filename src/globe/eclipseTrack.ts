import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial } from "three";
import { APRIL_ECLIPSE_END, APRIL_ECLIPSE_START } from "../geo/aprilEclipse";
import { APRIL_ECLIPSE_PATH } from "../geo/aprilEclipseData";
import { toVec3 } from "../geo/sphere";

export function createEclipseTrack() {
  const geometry = new BufferGeometry();
  const vertices = new Float32Array(APRIL_ECLIPSE_PATH.flatMap(([lat, lon]) => toVec3(lon, lat, 1.0055)));
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  const path = new Line(
    geometry,
    new LineBasicMaterial({ color: 0xf1d498, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  path.renderOrder = 5;
  path.visible = false;
  const trailGeometry = new BufferGeometry();
  const trail = new Float32Array(vertices.length);
  const position = new BufferAttribute(trail, 3);
  trailGeometry.setAttribute("position", position);
  const traced = new Line(
    trailGeometry,
    new LineBasicMaterial({ color: 0xf1d498, transparent: true, depthWrite: false }),
  );
  traced.frustumCulled = false;
  traced.renderOrder = 5.1;
  traced.visible = false;
  path.add(traced);

  return {
    path,
    setTime: (at: number | null) => {
      path.visible = at !== null;
      if (at === null) return;
      const elapsed = (at - APRIL_ECLIPSE_START) / (APRIL_ECLIPSE_END - APRIL_ECLIPSE_START);
      const row = elapsed * (APRIL_ECLIPSE_PATH.length - 1);
      const full = Math.floor(row);
      const end = Math.min(full + 1, APRIL_ECLIPSE_PATH.length - 1);
      trail.set(vertices);
      if (end > full) {
        for (let axis = 0; axis < 3; axis += 1) {
          const start = vertices[full * 3 + axis]!;
          trail[end * 3 + axis] = start + (vertices[end * 3 + axis]! - start) * (row - full);
        }
      }
      position.needsUpdate = true;
      trailGeometry.setDrawRange(0, end + 1);
      traced.visible = row > 0;
    },
    dispose: () => {
      geometry.dispose();
      path.material.dispose();
      trailGeometry.dispose();
      traced.material.dispose();
    },
  };
}
