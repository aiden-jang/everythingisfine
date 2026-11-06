import {
  AdditiveBlending,
  BackSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type Color,
  type Vector3,
} from "three";
import { RADIUS_ATMOSPHERE } from "../geo/land";
import { attachLonLat, SPHERE_PHI_START } from "./morph";
import { ATMOSPHERE, GLINT, GLINT_RADIUS } from "./surfaceLight";

export function createSurfaceLayers(
  sun: Vector3,
  morph: { value: number },
  rimColor: Color,
  glintColor: Color,
) {
  // The halo extends outside geography; the glint belongs only to curved ocean.
  const rim = new Mesh(
    new SphereGeometry(RADIUS_ATMOSPHERE, 64, 48),
    new ShaderMaterial({
      ...ATMOSPHERE,
      uniforms: {
        uColor: { value: rimColor },
        uIntensity: { value: 0.3 },
        uOuter: { value: 1.22 },
        uSun: { value: sun },
      },
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  const geometry = new SphereGeometry(GLINT_RADIUS, 96, 64, SPHERE_PHI_START);
  attachLonLat(geometry);
  const glint = new Mesh(
    geometry,
    new ShaderMaterial({
      ...GLINT,
      uniforms: {
        uColor: { value: glintColor },
        uSun: { value: sun },
        uIntensity: { value: 0.3 },
        uPower: { value: 34 },
        uMorph: morph,
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  glint.renderOrder = 0.75;
  const reveal = { value: 0 };
  let elapsed = 0;
  return {
    rim,
    glint,
    reveal,
    begin(): void {
      elapsed = 0;
      reveal.value = 0;
    },
    step(dt: number, reduced: boolean): boolean {
      elapsed = reduced ? 2.2 : Math.min(2.2, elapsed + dt);
      reveal.value = elapsed / 2.2;
      return elapsed < 2.2;
    },
    apply(local = 0): void {
      const flare = Math.sin(Math.PI * reveal.value);
      rim.material.uniforms["uIntensity"]!.value = (0.3 + 0.42 * flare) * (1 - morph.value) * (1 - local);
      glint.material.uniforms["uIntensity"]!.value = (0.3 + 0.18 * flare) * (1 - morph.value) * (1 - local);
      rim.visible = glint.visible = morph.value < 0.999;
    },
  };
}
