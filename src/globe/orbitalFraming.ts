import { Vector3, type PerspectiveCamera } from "three";
import type { ObservationFrame } from "../app/observations/types";

export function createOrbitalFraming() {
  let goal: ObservationFrame["orbit"];
  let amount = 0;
  let distance = 0;
  let fitNarrow = false;
  const focus = new Vector3();
  const target = new Vector3();
  const direction = new Vector3();
  let dirty = false;
  return {
    magnification(gain: number, morph: number) {
      return 1 + (gain - 1) * (1 - amount * (1 - morph));
    },
    set(orbit: ObservationFrame["orbit"]) {
      if (orbit && !goal && amount === 0) {
        focus.fromArray(orbit.focus);
        distance = orbit.distance;
      }
      if (orbit) fitNarrow = !!orbit.fitNarrow;
      goal = orbit;
      dirty = true;
    },
    step(dt: number, reduced: boolean) {
      const targetAmount = goal ? 1 : 0;
      const gain = reduced ? 1 : -Math.expm1(-7 * dt);
      amount += (targetAmount - amount) * gain;
      if (Math.abs(targetAmount - amount) < 0.001) amount = targetAmount;
      let moving = amount !== targetAmount;
      if (goal) {
        target.fromArray(goal.focus);
        moving ||= focus.distanceTo(target) + Math.abs(distance - goal.distance) > 0.001;
        focus.lerp(target, gain);
        distance += (goal.distance - distance) * gain;
      }
      return moving;
    },
    apply(camera: PerspectiveCamera, morph: number, reset: () => void, zoom = 1) {
      if (!dirty && amount === 0) return;
      reset();
      if (amount === 0 || morph === 1) {
        camera.far = 100;
        camera.updateProjectionMatrix();
        dirty = amount > 0;
        return;
      }
      const blend = amount * (1 - morph);
      const framingDistance = (distance * zoom) / (fitNarrow ? Math.min(1, camera.aspect) : 1);
      direction.copy(camera.position).normalize().multiplyScalar(framingDistance).add(focus);
      camera.position.lerp(direction, blend);
      target.copy(focus).multiplyScalar(blend);
      if (fitNarrow && camera.aspect > 1) {
        // Leave room below the orbital subject for the playback dock.
        camera.lookAt(target);
        direction.set(0, -0.06 * framingDistance * blend, 0).applyQuaternion(camera.quaternion);
        camera.position.add(direction);
        target.add(direction);
      }
      camera.lookAt(target);
      camera.far = blend > 0 ? 2000 : 100;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      dirty = amount > 0;
    },
  };
}
