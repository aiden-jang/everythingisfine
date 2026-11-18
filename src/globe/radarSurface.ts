import { DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, Texture } from "three";
import { GLOBAL_RADAR_BOUNDS, radarMercatorY } from "../sources/rainviewer";
import { RADAR_BOUNDS } from "../sources/radar";
import { morphable } from "./morph";
import type { createRadarReveal } from "./radarReveal";
import { rasterGeometry } from "./observationLayer";

export function createRadarSurface(
  morph: { value: number },
  sweep?: ReturnType<typeof createRadarReveal>["uniforms"],
) {
  const geometry = rasterGeometry(RADAR_BOUNDS);
  let worldwide = false;
  let reveal = 1;
  const material = new MeshBasicMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  morphable(material, morph);
  if (sweep) {
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      Object.assign(shader.uniforms, sweep);
      shader.vertexShader = `varying vec3 vRadarSurface;\n${shader.vertexShader}`.replace(
        "vec3 transformed = fmProject(position);",
        "vec3 transformed = fmProject(position); vRadarSurface = position;",
      );
      shader.fragmentShader = /* glsl */ `
        varying vec3 vRadarSurface;
        uniform vec3 radarSweepSite;
        uniform vec3 radarSweepAxis;
        uniform float radarSweepReach;
        uniform float radarSweepEdge;
        uniform float radarSweepAmount;
        ${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        if (radarSweepAmount > 0.0) {
          vec3 point = normalize(vRadarSurface);
          float front = smoothstep(0.0, 0.63, dot(point, radarSweepSite));
          float edge = dot(point, radarSweepAxis) / radarSweepReach - radarSweepEdge;
          float pixel = clamp(fwidth(edge), 0.001, 0.014);
          float core = 1.0 - smoothstep(pixel, 2.3 * pixel, abs(edge));
          float halo = exp(-abs(edge) * 45.0);
          float beyond = smoothstep(-0.02, 0.07, edge);
          float amount = radarSweepAmount * front;
          diffuseColor.a *= 1.0 - 0.78 * beyond * amount;
          float light = (0.68 * core + 0.21 * halo) * amount * opacity;
          float combined = light + diffuseColor.a * (1.0 - light);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.80, 0.87), light / max(combined, 0.001));
          diffuseColor.a = combined;
        }`,
      );
    };
    material.customProgramCacheKey = () => "fm-morph-storm-radar-reveal";
  }
  const object = new Mesh(geometry, material);
  object.name = "storm-radar";
  object.frustumCulled = false;
  object.renderOrder = 4.5;
  object.visible = false;

  function setImage(image: ImageBitmap | null, global = false) {
    if (global !== worldwide) {
      object.geometry.dispose();
      object.geometry = rasterGeometry(global ? GLOBAL_RADAR_BOUNDS : RADAR_BOUNDS);
      if (global) {
        const uv = object.geometry.getAttribute("uv");
        const coordinates = object.geometry.getAttribute("aLonLat");
        for (let i = 0; i < uv.count; i++)
          uv.setY(i, Math.max(0, Math.min(1, 1 - radarMercatorY(coordinates.getY(i)))));
      }
      worldwide = global;
    }
    if ((material.map?.image ?? null) === image) return;
    const arriving = !material.map && image !== null;
    material.map?.dispose();
    material.map = image ? new Texture(image) : null;
    if (material.map) {
      // ImageBitmap uploads keep the PNG's northern row first, independently of Texture.flipY.
      material.map.flipY = false;
      material.map.repeat.y = -1;
      material.map.offset.y = 1;
      material.map.colorSpace = SRGBColorSpace;
      material.map.needsUpdate = true;
    }
    if (arriving) material.opacity = reveal = 0;
    object.visible = image !== null;
    material.needsUpdate = true;
  }

  return {
    object,
    setImage,
    step(dt: number, reduced: boolean, strength = 1): boolean {
      if (!object.visible) return false;
      reveal = reduced ? 1 : Math.min(1, reveal + dt / 0.24);
      material.opacity = reveal * strength;
      return reveal < 1;
    },
  };
}
