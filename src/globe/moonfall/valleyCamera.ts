import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { DEG } from "../../geo/sphere";
import { valley } from "../../sources/moonfall/traverses";

const centerX = (valley.left + valley.right) / 2;
const centerZ = (valley.near + valley.far) / 2;

export function easeLunarMotion(t: number) {
  return t * t * (3 - 2 * t);
}

export function createValleyCamera() {
  const camera = new PerspectiveCamera(38, 1, 0.025, 120);
  const map = new OrthographicCamera(-1, 1, 1, -1, camera.near, camera.far);
  const target = new Vector3();
  const shift = new Matrix4();

  return (aspect: number, overhead: number, relief: number, descent: number, stop?: Vector3) => {
    const halfHeight = Math.max(
      (valley.near - valley.far) * 0.55,
      ((valley.right - valley.left) * 0.55) / aspect,
    );
    const halfWidth = halfHeight * aspect;
    const dip = Math.sin(Math.PI * descent);
    const tilt = (39 + 16 * dip) * DEG * (1 - overhead);
    const radius = (halfHeight / Math.tan((camera.fov * DEG) / 2)) * (1 - 0.28 * dip);
    target.set(stop?.x ?? centerX, (stop?.y ?? 0.3) * relief, stop?.z ?? centerZ);
    camera.position.set(0, Math.cos(tilt) * radius, Math.sin(tilt) * radius).add(target);
    camera.up.set(0, Math.sin(tilt), -Math.cos(tilt));
    camera.lookAt(target);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    map.left = -halfWidth;
    map.right = halfWidth;
    map.top = halfHeight;
    map.bottom = -halfHeight;
    map.updateProjectionMatrix();
    // Both matrices have clip-space W=1 at the pivot after normalization. The
    // stop keeps one screen position as foreshortening and elevation recede.
    const perspective = camera.projectionMatrix.elements;
    const plan = map.projectionMatrix.elements;
    for (let i = 0; i < perspective.length; i++) {
      perspective[i] = (perspective[i]! / radius) * (1 - overhead) + plan[i]! * overhead;
    }
    camera.projectionMatrix.premultiply(
      shift.makeTranslation(
        (0.7 * (target.x - centerX)) / halfWidth,
        (0.65 * (centerZ - target.z)) / halfHeight,
        0,
      ),
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    return camera;
  };
}
