import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, MeshBasicMaterial, Points, ShaderMaterial, Vector3 } from "three";
import { createFigures } from "./figures";
import { createCutaway } from "./cutaway";
import { CUTAWAY_DEPTH_KM } from "./cutawayScale";
import { createRegroup } from "./regroup";
import { EARTH_RADIUS_KM } from "../geo/sphere";
import { orbitCoordinates } from "./orbitReadout";

describe("finite scene presentation", () => {
  it("traces every constellation independently and rests after revealing the real connections", () => {
    const figures = createFigures();
    figures.setFigures([
      [0, 0, 20, 5, 25, 20],
      [100, 10, 130, 15],
    ]);
    figures.setOn(true);
    const material = figures.object.material as ShaderMaterial;
    const traces = figures.object.geometry.getAttribute("aTrace");
    expect([...traces.array]).toEqual([0, 0.5, 0.5, 1, 0, 1]);
    expect(figures.step(0.1, false)).toBe(true);
    expect(material.uniforms["uTrace"]!.value).toBeGreaterThan(0);
    expect(material.uniforms["uTrace"]!.value).toBeLessThan(1);
    expect(figures.step(1, false)).toBe(false);
    figures.setOn(false);
    expect(figures.object.visible).toBe(false);
    figures.setOn(true);
    expect(figures.step(0, true)).toBe(false);
    expect(material.uniforms["uTrace"]!.value).toBe(1);
    figures.dispose();
  });

  it("opens a fixed region at true scale, closes it on the map, and skips easing under reduced motion", () => {
    const cutaway = createCutaway();
    const material = new MeshBasicMaterial();
    cutaway.patch(material);
    const shader = { uniforms: {}, vertexShader: "void main() {}", fragmentShader: "void main() {}" };
    material.onBeforeCompile(shader as never, {} as never);
    const uniforms = shader.uniforms as Record<string, { value: number | Vector3 }>;
    cutaway.set({ lon: 90, lat: 0 });
    expect(cutaway.step(1, false, 0, true)).toBe(false);
    expect(cutaway.object.visible).toBe(false);
    expect(cutaway.step(0.1, false, 0)).toBe(true);
    const center = uniforms["uCutCenter"]!.value as Vector3;
    expect(center.x).toBeCloseTo(1);
    expect(center.y).toBeCloseTo(0);
    expect(cutaway.step(1, false, 0)).toBe(false);
    expect(uniforms["uCutThreshold"]!.value).toBeCloseTo(Math.cos((20 * Math.PI) / 180));
    const floor = cutaway.object.children[0] as unknown as { geometry: BufferGeometry };
    const positions = floor.geometry.getAttribute("position");
    const radii = Array.from({ length: positions.count }, (_, i) =>
      new Vector3().fromBufferAttribute(positions, i).length(),
    );
    expect(Math.min(...radii)).toBeCloseTo(1 - CUTAWAY_DEPTH_KM / EARTH_RADIUS_KM, 6);
    cutaway.step(0, true, 1);
    expect(cutaway.isOpen()).toBe(false);
    expect(cutaway.object.visible).toBe(false);
    expect(cutaway.step(0.2, false, 0.5)).toBe(false);
    expect(cutaway.isOpen()).toBe(false);
    expect(uniforms["uCutEnabled"]!.value).toBe(0);
    cutaway.step(0, true, 0);
    expect(cutaway.object.visible).toBe(true);
    expect(center.x).toBeCloseTo(1);
    cutaway.set({ lon: 90, lat: 0, dive: true, cameraOnly: true });
    cutaway.step(0, true, 0);
    expect(cutaway.isOpen()).toBe(false);
    expect(cutaway.object.visible).toBe(false);
    cutaway.set(null);
    expect(cutaway.step(0, true, 0)).toBe(false);
    expect(cutaway.object.visible).toBe(false);
    cutaway.object.traverse((child) => {
      if ("geometry" in child) (child.geometry as BufferGeometry).dispose();
    });
    material.dispose();
  });

  it("blends marker groups without moving locations or restarting on every zoom frame", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 3));
    geometry.setDrawRange(0, 2);
    const material = new ShaderMaterial({ uniforms: { uOpacity: { value: 1 } } });
    const source = new Points(geometry, material);
    const regroup = createRegroup(source);
    regroup.begin(false);
    (geometry.getAttribute("position").array as Float32Array)[0] = 9;
    expect([...regroup.object.geometry.getAttribute("position").array]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(regroup.step(0.1, false)).toBe(true);
    const ghost = regroup.object.material;
    expect(material.uniforms["uOpacity"]!.value + ghost.uniforms["uOpacity"]!.value).toBeCloseTo(1);
    regroup.begin(false);
    expect(regroup.object.geometry.getAttribute("position").getX(0)).toBe(1);
    expect(regroup.step(0.1, false)).toBe(true);
    expect(material.uniforms["uOpacity"]!.value).toBe(1);
    expect(regroup.step(0.3, false)).toBe(false);
    regroup.begin(false);
    expect(regroup.step(0, true)).toBe(false);
    expect(regroup.object.visible).toBe(false);
    regroup.dispose();
    geometry.dispose();
    material.dispose();
  });

  it("reports real wrapped coordinates, not arbitrary camera angles", () => {
    expect(orbitCoordinates({ lon: 190, lat: -22.4, zoom: 1.6 })).toBe("22.4° S · 170.0° W · 1.60×");
    expect(orbitCoordinates({ lon: -360, lat: 0, zoom: 1 })).toBe("0.0° N · 0.0° E · 1.00×");
  });
});
