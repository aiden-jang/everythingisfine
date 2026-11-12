import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
} from "three";
import type { GeoPoint, ObservationFrame, ObservationView } from "../app/observations/types";
import { DEG, toVec3 } from "../geo/sphere";
import { MORPH_GLSL, morphable } from "./morph";

import { createObservationCurtain } from "./observationCurtain";
import { createObservationTerrain } from "./observationTerrain";
import { createObservationMoon } from "./observationMoon";

const INK = 0x8adbd8;
const PALE = 0xe6f1fa;
const FULL = [-180, -90, 180, 90] as const;

function rows() {
  const position: number[] = [];
  const coordinates: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const color = new Color();
  return {
    push(point: GeoPoint, rgb: number, size = 0) {
      position.push(...toVec3(point.lon, point.lat, 1 + (point.lift ?? 0.012)));
      coordinates.push(point.lon, point.lat);
      color.setHex(rgb);
      colors.push(color.r, color.g, color.b);
      sizes.push(size);
    },
    geometry() {
      return new BufferGeometry()
        .setAttribute("position", new BufferAttribute(new Float32Array(position), 3))
        .setAttribute("aLonLat", new BufferAttribute(new Float32Array(coordinates), 2))
        .setAttribute("color", new BufferAttribute(new Float32Array(colors), 3))
        .setAttribute("aSize", new BufferAttribute(new Float32Array(sizes), 1));
    },
  };
}

function wrapSegment(a: GeoPoint, b: GeoPoint, draw: (p: GeoPoint, q: GeoPoint) => void) {
  const delta = b.lon - a.lon;
  if (Math.abs(delta) <= 180) {
    draw(a, b);
    return;
  }
  const edge = delta < 0 ? 180 : -180;
  const t = (edge - a.lon) / (delta + edge * 2);
  const at = {
    lon: edge,
    lat: a.lat + (b.lat - a.lat) * t,
    lift: (a.lift ?? 0) * (1 - t) + (b.lift ?? 0) * t,
  };
  draw(a, at);
  draw({ ...at, lon: -edge }, b);
}

type Raster = NonNullable<ObservationFrame["raster"]>;

export function rasterGeometry(bounds: NonNullable<Raster["bounds"]>, corners?: Raster["corners"]) {
  const [west, south, east, north] = bounds;
  const geometry = new SphereGeometry(
    1.009,
    64,
    42,
    (west + 90) * DEG,
    (east - west) * DEG,
    (90 - north) * DEG,
    (north - south) * DEG,
  );
  const uv = geometry.attributes.uv!;
  const vertices = geometry.attributes.position!;
  const coordinates = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    const u = Math.min(1, Math.max(0, uv.getX(i)));
    const v = uv.getY(i);
    let lon = west + (east - west) * u;
    let lat = south + (north - south) * v;
    if (corners) {
      const [sw, se, nw, ne] = corners;
      const mix = (a: number, b: number, c: number, d: number) =>
        (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
      lon = mix(sw.lon, se.lon, nw.lon, ne.lon);
      lat = mix(sw.lat, se.lat, nw.lat, ne.lat);
      vertices.setXYZ(i, ...toVec3(lon, lat, 1.009));
    }
    coordinates[i * 2] = lon;
    coordinates[i * 2 + 1] = lat;
  }
  geometry.setAttribute("aLonLat", new BufferAttribute(coordinates, 2));
  return geometry;
}

export function createObservationLayer(morph: { value: number }) {
  const object = new Group();
  const curtain = createObservationCurtain(morph);
  object.add(curtain.object);
  const terrain = createObservationTerrain(morph);
  object.add(terrain.object);
  const moon = createObservationMoon(morph);
  object.add(moon.object);
  const orbital = { value: 0 };
  const lineMaterial = new ShaderMaterial({
    uniforms: { uMorph: morph, opacity: { value: 0.88 }, phase: { value: -1 }, orbital },
    vertexShader: /* glsl */ `
      ${MORPH_GLSL}
      attribute vec3 color;
      attribute float aSize;
      varying vec3 tint;
      varying float trail;
      uniform float orbital;
      void main() {
        tint = color;
        trail = aSize;
        vec3 point=mix(position,normalize(position)*1.012,uMorph*orbital);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(fmProject(point), 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 tint;
      varying float trail;
      uniform float phase;
      uniform float opacity;
      void main() {
        float distance = (trail - phase) * 6.0;
        float head = exp(-distance * distance);
        float amount = phase < 0.0 ? 1.0 : (0.35 + 0.65 * head);
        gl_FragColor = vec4(tint, opacity * amount);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const line = new LineSegments(new BufferGeometry(), lineMaterial);
  const dot = new Points(
    new BufferGeometry(),
    new ShaderMaterial({
      uniforms: {
        orbital,
        uMorph: morph,
        pixelRatio: { value: Math.min(devicePixelRatio || 1, 2) },
        reveal: { value: 1 },
      },
      vertexShader: /* glsl */ `
      ${MORPH_GLSL}
      attribute vec3 color;
      attribute float aSize;
      uniform float orbital;
      uniform float pixelRatio;
      varying vec3 tint;
      void main() {
        tint = color;
        vec3 point=mix(position,normalize(position)*1.012,uMorph*orbital);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(fmProject(point), 1.0);
        gl_PointSize = aSize * pixelRatio;
      }
    `,
      fragmentShader: /* glsl */ `
      varying vec3 tint;
      uniform float reveal;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float core = 1.0 - smoothstep(0.15, 0.24, r);
        float rim = (1.0 - smoothstep(0.38, 0.5, r)) * smoothstep(0.26, 0.34, r);
        gl_FragColor = vec4(tint, reveal * (core + rim * 0.43));
        #include <colorspace_fragment>
      }
    `,
      transparent: true,
      depthWrite: false,
    }),
  );
  const raster = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  morphable(raster.material, morph);
  const sweep = { value: 1 };
  const compileRaster = raster.material.onBeforeCompile;
  raster.material.onBeforeCompile = (shader, renderer) => {
    compileRaster(shader, renderer);
    shader.uniforms.sweep = sweep;
    shader.fragmentShader = `uniform float sweep;\n${shader.fragmentShader}`.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       #ifdef USE_MAP
       diffuseColor.a *= smoothstep(vMapUv.x - 0.025, vMapUv.x + 0.025, sweep);
       #endif`,
    );
  };
  raster.material.customProgramCacheKey = () => "fm-morph-radar-sweep";
  raster.renderOrder = 4;
  line.renderOrder = 5;
  dot.renderOrder = 6;
  raster.frustumCulled = line.frustumCulled = dot.frustumCulled = false;
  raster.visible = object.visible = false;
  object.add(raster, line, dot);
  let prior: ObservationView | null = null;
  let reveal = 0;
  let travel = 0;

  function set(view: ObservationView | null) {
    if (view === prior) return;
    curtain.set(view?.curtain);
    terrain.set(view?.terrain);
    moon.set(view);
    orbital.value = view?.frame.orbit ? 1 : 0;
    if (view?.target !== prior?.target) reveal = 0;
    object.visible = !!view;
    if (view?.frame.paths !== prior?.frame.paths || view?.frame.raster !== prior?.frame.raster) travel = 0;
    if (view?.frame.paths !== prior?.frame.paths) {
      const paths = rows();
      for (const { points, color = INK } of view?.frame.paths ?? []) {
        for (let i = 1; i < points.length; i++)
          wrapSegment(points[i - 1]!, points[i]!, (a, b) => {
            paths.push(a, color, (i - 1) / (points.length - 1));
            paths.push(b, color, i / (points.length - 1));
          });
      }
      line.geometry.dispose();
      line.geometry = paths.geometry();
    }
    if (view?.frame.marks !== prior?.frame.marks) {
      const marks = rows();
      for (const mark of view?.frame.marks ?? []) marks.push(mark, mark.color ?? PALE, mark.size ?? 13);
      dot.geometry.dispose();
      dot.geometry = marks.geometry();
    }
    const image = view?.frame.raster ? (view.surface ?? view.image) : null;
    const priorImage = prior?.frame.raster ? (prior.surface ?? prior.image) : null;
    if (image !== priorImage) {
      raster.material.map?.dispose();
      raster.material.map = view?.surface
        ? new CanvasTexture(view.surface)
        : image
          ? new Texture(image)
          : null;
      if (raster.material.map) {
        raster.material.map.colorSpace = SRGBColorSpace;
        raster.material.map.needsUpdate = true;
      }
      raster.material.needsUpdate = true;
    } else if (view?.surface && raster.material.map) raster.material.map.needsUpdate = true;
    const bounds = view?.frame.raster?.bounds ?? FULL;
    const corners = view?.frame.raster?.corners;
    if (
      image &&
      (!priorImage ||
        bounds !== (prior?.frame.raster?.bounds ?? FULL) ||
        corners !== prior?.frame.raster?.corners)
    ) {
      raster.geometry.dispose();
      raster.geometry = rasterGeometry(bounds, corners);
    }
    raster.visible = !!image;
    prior = view;
  }

  return {
    object,
    set,
    dispose() {
      set(null);
      curtain.dispose();
      terrain.dispose();
      moon.dispose();
    },
    step(dt: number, reduced: boolean) {
      const unfolding = curtain.step(dt, reduced);
      const lifting = terrain.step(dt, reduced);
      if (!prior) return false;
      reveal = reduced ? 1 : Math.min(1, reveal + dt / 1.15);
      const strength = reveal * reveal * (3 - 2 * reveal);
      dot.material.uniforms.reveal!.value = strength;
      raster.material.opacity = strength * (prior.frame.raster?.opacity ?? 0.88);
      travel = Math.min(1, travel + dt / 1.05);
      sweep.value = prior.frame.raster?.sweep && !reduced ? travel * 1.1 - 0.05 : 1.05;
      const sweeping = prior.frame.raster?.sweep && !reduced && travel < 1;
      const flowing = prior.frame.flow && !reduced && travel < 1;
      lineMaterial.uniforms.opacity!.value = strength * 0.88;
      lineMaterial.uniforms.phase!.value = flowing ? travel : -1;
      return reveal < 1 || !!flowing || !!sweeping || unfolding || lifting;
    },
  };
}
