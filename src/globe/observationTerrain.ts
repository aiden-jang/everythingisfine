import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, ShaderMaterial } from "three";
import type { ObservationTerrain, ObservationView } from "../app/observations/types";
import { toVec3 } from "../geo/sphere";
import { MORPH_GLSL } from "./morph";

const colors = [
  new Color(0x071024),
  new Color(0x143358),
  new Color(0x245e74),
  new Color(0x4f9999),
  new Color(0xb5c5a4),
];
const elevations = [-11000, -8000, -5000, -2000, 0];

export function seafloorGeometry(grid: ObservationTerrain) {
  const vertices: number[] = [],
    coordinates: number[] = [],
    tints: number[] = [],
    indices: number[] = [];
  const [west, south, east, north] = grid.bounds;
  const color = new Color();
  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.columns; col++) {
      const index = row * grid.columns + col;
      const value = grid.elevation[index]!;
      const lon = west + (col / (grid.columns - 1)) * (east - west);
      const lat = south + (row / (grid.rows - 1)) * (north - south);
      vertices.push(...toVec3(lon, lat, 1.012 + ((Math.min(0, value) + 11000) * 30) / 6371000));
      coordinates.push(lon, lat);
      const upper = Math.max(
        1,
        elevations.findIndex((e) => value <= e),
      );
      const i = value >= 0 ? 4 : upper;
      color
        .copy(colors[i - 1]!)
        .lerp(
          colors[i]!,
          Math.max(0, Math.min(1, (value - elevations[i - 1]!) / (elevations[i]! - elevations[i - 1]!))),
        );
      tints.push(color.r, color.g, color.b);
      if (row && col) {
        const a = index - grid.columns - 1,
          b = index - grid.columns,
          c = index - 1;
        indices.push(a, c, b, b, c, index);
      }
    }
  const geometry = new BufferGeometry()
    .setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
    .setAttribute("aLonLat", new BufferAttribute(new Float32Array(coordinates), 2))
    .setAttribute("color", new BufferAttribute(new Float32Array(tints), 3))
    .setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createObservationTerrain(morph: { value: number }) {
  const object = new Group();
  const material = new ShaderMaterial({
    uniforms: { uMorph: morph, reveal: { value: 0 } },
    vertexShader: `${MORPH_GLSL}
      attribute vec3 color; uniform float reveal;
      varying vec3 tint; varying vec3 litNormal; varying float depth;
      void main() {
        tint=color; litNormal=normal; depth=(length(position)-1.012)*6371.0/30.0-11.0;
        vec3 lifted=mix(normalize(position)*1.012,position,reveal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(fmProject(lifted),1.0);
      }`,
    fragmentShader: `uniform float uMorph; varying vec3 tint; varying vec3 litNormal; varying float depth;
      void main() {
        float light=0.58+0.6*abs(dot(normalize(litNormal),normalize(vec3(0.4,0.7,0.3))));
        float contour=1.0-smoothstep(0.0,0.025,abs(fract(-depth)-0.5));
        vec3 ink=tint*mix(light,1.0,uMorph);
        ink=mix(ink,vec3(0.38,0.55,0.59),contour*0.24);
        gl_FragColor=vec4(ink,1.0);
        #include <colorspace_fragment>
      }`,
    side: DoubleSide,
  });
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const waterMaterial = new ShaderMaterial({
    uniforms: { uMorph: morph, opacity: { value: 0.8 } },
    vertexShader: `${MORPH_GLSL}
      void main() { gl_Position=projectionMatrix*modelViewMatrix*vec4(fmProject(normalize(position)*1.064),1.0); }`,
    fragmentShader: `uniform float opacity;
      void main() { gl_FragColor=vec4(0.055,0.19,0.27,opacity);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const water = new Mesh(mesh.geometry, waterMaterial);
  water.frustumCulled = false;
  water.renderOrder = 6;
  object.add(mesh, water);
  object.visible = false;
  let prior: ObservationTerrain | undefined;
  let reveal = 0;
  return {
    object,
    set(view: ObservationView["terrain"]) {
      object.visible = !!view;
      if (view?.grid === prior) return;
      mesh.geometry.dispose();
      mesh.geometry = view ? seafloorGeometry(view.grid) : new BufferGeometry();
      water.geometry = mesh.geometry;
      prior = view?.grid;
      reveal = 0;
    },
    step(dt: number, reduced: boolean) {
      if (!prior) return false;
      reveal = reduced ? 1 : Math.min(1, reveal + dt / 1.4);
      material.uniforms.reveal!.value = 1 - (1 - reveal) ** 3;
      waterMaterial.uniforms.opacity!.value = 0.8 * (1 - reveal) ** 2;
      water.visible = reveal < 1;
      return reveal < 1;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      waterMaterial.dispose();
    },
  };
}
