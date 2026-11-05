import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Raycaster, ShaderMaterial, Sphere, Vector2, Vector3 } from "three";
import { createPlanetarium } from "./planetarium";
import { createControls } from "./controls";
import { createFigures } from "./figures";

const cameraAtEarth = () => {
  const camera = new PerspectiveCamera(45, 1.1, 0.1, 100);
  camera.position.set(0, 0, 3.6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
};
const apply = (camera: PerspectiveCamera, sky: ReturnType<typeof createPlanetarium>) => {
  camera.lookAt(0, 0, 0);
  sky.apply();
  camera.updateMatrixWorld();
};
afterEach(() => vi.unstubAllGlobals());

describe("finite planetarium composition", () => {
  it("opens the sky above a real Earth horizon and restores centred framing", () => {
    const camera = cameraAtEarth(),
      sky = createPlanetarium(camera);
    sky.set(true);
    expect(sky.ready()).toBe(false);
    expect(sky.step(0.5, false)).toBe(true);
    apply(camera, sky);
    const partial = camera.getWorldDirection(new Vector3()).y;
    expect(partial).toBeGreaterThan(0);
    expect(sky.step(1, false)).toBe(false);
    apply(camera, sky);
    expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(partial);
    const ray = new Raycaster(),
      earth = new Sphere(new Vector3(), 1);
    ray.setFromCamera(new Vector2(0, 0), camera);
    expect(ray.ray.intersectSphere(earth, new Vector3())).toBeNull();
    ray.setFromCamera(new Vector2(0, -0.95), camera);
    expect(ray.ray.intersectSphere(earth, new Vector3())).not.toBeNull();
    sky.set(false);
    expect(sky.step(0.95, false)).toBe(false);
    apply(camera, sky);
    ray.setFromCamera(new Vector2(0, 0), camera);
    expect(ray.ray.intersectSphere(earth, new Vector3())).not.toBeNull();
    expect(Math.abs(camera.getWorldDirection(new Vector3()).y)).toBe(0);
  });
  it("freezes at the displayed pitch on input and can resume an explicit scene request", () => {
    const camera = cameraAtEarth(),
      sky = createPlanetarium(camera);
    sky.set(true);
    sky.step(0.3, false);
    apply(camera, sky);
    const interrupted = camera.quaternion.clone();
    sky.interrupt();
    expect(sky.step(100, false)).toBe(false);
    apply(camera, sky);
    expect(camera.quaternion.toArray()).toEqual(interrupted.toArray());
    expect(sky.ready()).toBe(true);
    sky.resume();
    expect(sky.ready()).toBe(false);
    expect(sky.step(2, false)).toBe(false);
    apply(camera, sky);
    expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(0.43);
    sky.clear();
    apply(camera, sky);
    expect(Math.abs(camera.getWorldDirection(new Vector3()).y)).toBe(0);
  });
  it("keeps the final composition under reduced motion and clears it for a map", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const camera = cameraAtEarth();
    const controls = createControls(
      camera,
      { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement,
      { lon: 0, lat: 0 },
      45,
    );
    controls.apply();
    const before = controls.state();
    controls.setPlanetarium(true);
    controls.enter();
    expect(controls.skyReady()).toBe(true);
    expect(controls.state()).toEqual(before);
    expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(0.43);
    controls.setPlanetarium(false);
    expect(Math.abs(camera.getWorldDirection(new Vector3()).y)).toBe(0);
    controls.setMorph(1);
    const flat = camera.quaternion.clone();
    controls.setPlanetarium(true);
    expect(camera.quaternion.toArray()).toEqual(flat.toArray());
    controls.setMorph(0);
    controls.apply();
    expect(controls.skyReady()).toBe(true);
    expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(0.43);
  });
  it("holds guide tracing until arrival, retraces a fresh reveal, and skips waiting under reduced motion", () => {
    const figures = createFigures();
    figures.setFigures([[0, 0, 20, 5, 25, 20]]);
    figures.setOn(true);
    const uniforms = (figures.object.material as ShaderMaterial).uniforms;
    expect(figures.step(2, false, true)).toBe(true);
    expect(uniforms["uTrace"]!.value).toBe(0);
    figures.step(0.2, false);
    expect(uniforms["uTrace"]!.value).toBeGreaterThan(0);
    expect(uniforms["uTrace"]!.value).toBeLessThan(1);
    expect(figures.step(2, false)).toBe(false);
    figures.step(0.1, false, true);
    expect(uniforms["uTrace"]!.value).toBe(0);
    expect(figures.step(0, true, true)).toBe(false);
    expect(uniforms["uTrace"]!.value).toBe(1);
    figures.setOpacity(0);
    expect(figures.step(0, false, true)).toBe(false);
    figures.dispose();
  });
});
