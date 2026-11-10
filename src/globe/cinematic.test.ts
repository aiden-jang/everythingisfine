import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { entranceFrom, entrancePose, entranceDone, cameraRigTarget, type CameraTarget } from "./cameraFlight";
import { createFlightTarget } from "./cameraTarget";
import type { Controls } from "./controls";
import { createCameraRig } from "./cameraRig";
import { createDepthDive } from "./depthDive";
import { createStarExposure } from "./starExposure";
import { createSurfaceLayers } from "./surfaceLayers";
import { Color, Vector3 } from "three";

describe("cinematic camera and light", () => {
  it("replays arrival only on request and retains perspective-correct panel lift", () => {
    const controls = {
      flyTo: vi.fn(),
      enter: vi.fn(),
      setPlanetarium: vi.fn(),
      setDive: vi.fn(),
      degForPx: vi.fn(() => 30),
    };
    const wake = vi.fn(),
      reveal = vi.fn();
    const fly = createFlightTarget(controls as unknown as Controls, wake, reveal);
    fly(10, 30, 1.5, 100);
    expect(controls.flyTo).toHaveBeenLastCalledWith(10, 8, 1.5);
    expect(controls.degForPx).toHaveBeenCalledWith(100, 1.5);
    expect(controls.enter).not.toHaveBeenCalled();
    expect(controls.setPlanetarium).not.toHaveBeenCalled();
    fly(145, 12, 1, 0, true);
    expect(controls.flyTo).toHaveBeenLastCalledWith(145, 12, 1);
    expect(controls.enter).toHaveBeenCalledTimes(1);
    expect(controls.setPlanetarium).toHaveBeenLastCalledWith(false);
    expect(controls.setDive).toHaveBeenLastCalledWith(false);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledTimes(2);
  });
  it("waits for approach, holds an interrupted dive, and clears the tilt on exit", () => {
    const camera = new PerspectiveCamera(32, 1);
    const dive = createDepthDive(camera);
    const depthGap = (): number => {
      camera.position.set(0, 0, 2.15);
      camera.lookAt(0, 0, 0);
      dive.apply();
      camera.updateMatrixWorld();
      const surface = new Vector3(0, 0, 1).project(camera);
      const deep = new Vector3(0, 0, 0.86).project(camera);
      return Math.abs(surface.y - deep.y);
    };
    dive.set(true);
    expect(dive.step(2, false, false)).toBe(true);
    expect(depthGap()).toBe(0);
    expect(dive.step(0.4, false, true)).toBe(true);
    const partial = depthGap();
    expect(partial).toBeGreaterThan(0);
    dive.interrupt();
    expect(dive.step(2, false, true)).toBe(false);
    expect(depthGap()).toBe(partial);
    dive.set(false);
    expect(dive.step(0.75, false, false)).toBe(false);
    expect(depthGap()).toBe(0);
    dive.set(true);
    expect(dive.step(0, true, false)).toBe(false);
    expect(depthGap()).toBeGreaterThan(0.1);
    camera.position.set(0, -2.14, 0.1);
    camera.lookAt(0, 0, 0);
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    dive.apply();
    expect(new Vector3(1, 0, 0).applyQuaternion(camera.quaternion).dot(right)).toBeCloseTo(1);
  });
  it("reaches the original shared framing at different refresh rates", () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 5]) {
      const destination = { lon: -179, lat: 84, zoom: 1.3 };
      const target: CameraTarget = { ...destination, intro: { elapsed: 0, from: entranceFrom(destination) } };
      let at = target.intro!.from;
      expect(at.zoom).toBeGreaterThan(destination.zoom);
      expect(at.lat).toBeGreaterThanOrEqual(-85);
      expect(cameraRigTarget(target, at).lift).toBeGreaterThan(0.5);
      for (let t = 0; t < 2.5; t += dt) at = entrancePose(target, dt);
      expect(entranceDone(target)).toBe(true);
      expect(at).toEqual(destination);
      expect(cameraRigTarget(target, at)).toEqual({ bank: 0, lift: 0 });
    }
  });
  it("settles the lens after interruption and clears it immediately for reduced motion or a map", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 4);
    const rig = createCameraRig(camera, { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement);
    rig.snap(-0.15, 0.9);
    camera.lookAt(0, 0, 0);
    rig.apply(false);
    expect(camera.view?.enabled).toBe(true);
    expect(Math.abs(camera.quaternion.z)).toBeGreaterThan(0.01);
    let moving = true;
    for (let i = 0; i < 120; i++) moving = rig.step(1 / 60, { bank: 0, lift: 0 }, false);
    expect(moving).toBe(false);
    camera.lookAt(0, 0, 0);
    rig.apply(false);
    expect(camera.view?.enabled).toBe(false);
    expect(camera.quaternion.z).toBe(0);
    rig.snap(0.1, 0.9);
    rig.apply(true);
    expect(camera.view?.enabled).toBe(false);
    expect(rig.step(0, { bank: 0.1, lift: 0.9 }, true)).toBe(false);
    camera.lookAt(0, 0, 0);
    rig.apply(false);
    expect(camera.view?.enabled).toBe(false);
    expect(camera.quaternion.z).toBe(0);
  });
  it("keeps the surveyed region in frame while banking through a magnified replay", () => {
    for (const lens of [1, 13, 17, 36]) {
      const camera = new PerspectiveCamera(32, 1);
      camera.zoom = lens;
      camera.updateProjectionMatrix();
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      const rig = createCameraRig(camera, { clientWidth: 390, clientHeight: 390 } as HTMLCanvasElement);
      rig.setReplayAngle(0.025, 0.04);
      rig.apply(false);
      camera.updateMatrixWorld();
      const center = new Vector3(0, 0, 1).project(camera);
      expect(Math.abs(center.y)).toBeGreaterThan(0.1);
      expect(Math.abs(center.y)).toBeLessThan(0.15);
      camera.lookAt(0, 0, 0);
      rig.apply(true);
      camera.updateMatrixWorld();
      expect(new Vector3(0, 0, 1).project(camera).y).toBeCloseTo(0);
    }
  });
  it("does not draw trails from an old tab, a resized frame or reduced motion", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const exposure = createStarExposure();
    exposure.prepare(camera, 800, 600, false, 1000);
    expect(exposure.uniforms.uExposure.value).toBe(0);
    const eye = camera.position.clone();
    camera.position.x = 1;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    exposure.prepare(camera, 800, 600, false, 1016);
    expect(exposure.uniforms.uExposure.value).toBeGreaterThan(0);
    expect(exposure.uniforms.uPreviousEye.value).toEqual(eye);
    exposure.prepare(camera, 800, 600, false, 10000);
    expect(exposure.uniforms.uExposure.value).toBe(0);
    exposure.prepare(camera, 400, 600, false, 10016);
    expect(exposure.uniforms.uExposure.value).toBe(0);
    exposure.prepare(camera, 400, 600, true, 10032);
    expect(exposure.uniforms.uExposure.value).toBe(0);
  });
  it("returns reveal lighting to its resting exposure without owning another animation loop", () => {
    const lights = createSurfaceLayers(new Vector3(0, 0, 1), { value: 0 }, new Color(), new Color());
    lights.step(1.1, false);
    lights.apply();
    expect(lights.rim.material.uniforms["uIntensity"]!.value).toBeGreaterThan(0.6);
    expect(lights.step(1.1, false)).toBe(false);
    lights.apply();
    expect(lights.rim.material.uniforms["uIntensity"]!.value).toBeCloseTo(0.3);
    lights.begin();
    expect(lights.step(0, true)).toBe(false);
    expect(lights.reveal.value).toBe(1);
    for (const mesh of [lights.rim, lights.glint]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  });
});
