import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { DEG, EARTH_RADIUS_KM } from "../geo/sphere";

export interface CutawayFocus {
  lon: number;
  lat: number;
  dive?: true;
}
export const CUTAWAY_DEPTH_KM = 900;
const ANGLE = 20 * DEG;
const INNER_RADIUS = 1 - CUTAWAY_DEPTH_KM / EARTH_RADIUS_KM;

// A geometric reference well, not an inferred crust or mantle. Its radii use the events' true scale.
function wellGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const rim = new Color(0.16, 0.19, 0.22).convertSRGBToLinear();
  const floor = new Color(0.04, 0.06, 0.085).convertSRGBToLinear();
  const point = (r: number, angle: number, phi: number): number[] => [
    r * Math.sin(angle) * Math.cos(phi),
    r * Math.cos(angle),
    r * Math.sin(angle) * Math.sin(phi),
  ];
  const triangle = (...vertices: number[][]): void => {
    positions.push(...vertices.flat());
    for (const vertex of vertices) {
      const depth = Math.min(1, (1 - Math.hypot(...vertex)) / (1 - INNER_RADIUS));
      colors.push(
        rim.r + (floor.r - rim.r) * depth,
        rim.g + (floor.g - rim.g) * depth,
        rim.b + (floor.b - rim.b) * depth,
      );
    }
  };
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2,
      b = ((i + 1) / 96) * Math.PI * 2;
    const topA = point(1, ANGLE, a),
      topB = point(1, ANGLE, b);
    const lowA = point(INNER_RADIUS, ANGLE, a),
      lowB = point(INNER_RADIUS, ANGLE, b);
    triangle(topA, lowA, topB);
    triangle(topB, lowA, lowB);
    for (let j = 0; j < 12; j++) {
      const near = (j / 12) * ANGLE,
        far = ((j + 1) / 12) * ANGLE;
      triangle(point(INNER_RADIUS, near, a), point(INNER_RADIUS, far, a), point(INNER_RADIUS, far, b));
      triangle(point(INNER_RADIUS, near, a), point(INNER_RADIUS, far, b), point(INNER_RADIUS, near, b));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  return geometry;
}

export function createCutaway() {
  const center = { value: new Vector3(0, 1, 0) };
  const threshold = { value: 1 };
  const enabled = { value: 0 };
  const object = new Group();
  object.name = "regional-cutaway";
  const floor = new Mesh(wellGeometry(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  floor.renderOrder = 0.1;
  object.add(floor);
  const positions: number[] = [];
  const traces: number[] = [];
  for (const [ring, km] of [0, 300, 600, CUTAWAY_DEPTH_KM].entries()) {
    const r = 1 - km / EARTH_RADIUS_KM;
    for (let i = 0; i < 96; i++) {
      for (const at of [i, i + 1]) {
        const phi = (at / 96) * 2 * Math.PI;
        traces.push((ring + at / 96) / 4);
        positions.push(
          r * Math.sin(ANGLE) * Math.cos(phi),
          r * Math.cos(ANGLE),
          r * Math.sin(ANGLE) * Math.sin(phi),
        );
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aGuideTrace", new BufferAttribute(new Float32Array(traces), 1));
  const guideTrace = { value: 0 };
  const guide = new LineSegments(
    geometry,
    new LineBasicMaterial({ color: 0x66717c, transparent: true, opacity: 0.5 }),
  );
  guide.renderOrder = 0.2;
  object.add(guide);
  object.visible = false;
  const opening = { value: 0 };
  for (const material of [floor.material, guide.material]) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms["uOpening"] = opening;
      if (material === guide.material) {
        shader.uniforms["uGuideTrace"] = guideTrace;
        shader.vertexShader = shader.vertexShader.replace(
          "void main() {",
          "attribute float aGuideTrace; varying float vGuideTrace;\nvoid main() { vGuideTrace = aGuideTrace;",
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "void main() {",
          "varying float vGuideTrace; uniform float uGuideTrace;\nvoid main() { if (vGuideTrace > uGuideTrace) discard;",
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `
          #include <color_fragment>
          float head = uGuideTrace < 0.999 ? smoothstep(uGuideTrace - 0.045, uGuideTrace, vGuideTrace) : 0.0;
          diffuseColor.rgb *= 1.0 + head * 1.8;
        `,
        );
      }
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        "uniform float uOpening;\nvoid main() {",
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        float r = length(position);
        float angle = acos(clamp(position.y / r, -1.0, 1.0)) * uOpening;
        vec2 across = length(position.xz) > 0.0001 ? normalize(position.xz) : vec2(1.0, 0.0);
        vec3 transformed = vec3(across.x * sin(angle), cos(angle), across.y * sin(angle)) * r;
      `,
      );
    };
    material.customProgramCacheKey = () =>
      material === guide.material ? "cutaway-well-guides" : "cutaway-well-floor";
  }
  let target = 0,
    progress = 0;
  let guideProgress = 0;
  return {
    object,
    patch(material: Material): void {
      const compile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        Object.assign(shader.uniforms, {
          uCutCenter: center,
          uCutThreshold: threshold,
          uCutEnabled: enabled,
        });
        shader.vertexShader = shader.vertexShader.replace(
          "void main() {",
          "varying vec3 vCutPosition;\nvoid main() {\nvCutPosition = position;",
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "void main() {",
          `
          varying vec3 vCutPosition;
          uniform vec3 uCutCenter;
          uniform float uCutThreshold;
          uniform float uCutEnabled;
          void main() {
            if (uCutEnabled > 0.5 && dot(normalize(vCutPosition), uCutCenter) > uCutThreshold) discard;
        `,
        );
      };
      material.customProgramCacheKey = () => `${cacheKey}-cutaway`;
    },
    set(focus: CutawayFocus | null): void {
      target = focus ? 1 : 0;
      if (focus && progress === 0) guideProgress = 0;
      if (focus) {
        const lat = focus.lat * DEG,
          lon = focus.lon * DEG;
        center.value.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
        object.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), center.value);
      }
    },
    isOpen: (): boolean => progress > 0,
    step(dt: number, reduced: boolean, morph: number, waitingForDive = false): boolean {
      const openingTarget = waitingForDive && !reduced ? 0 : target;
      const step = reduced ? 1 : dt / 0.55;
      // This reference well has spherical geometry; open it only after the globe has returned.
      progress =
        openingTarget === 1 && morph > 0
          ? 0
          : openingTarget > progress
            ? Math.min(openingTarget, progress + step)
            : Math.max(openingTarget, progress - step);
      guideProgress = reduced
        ? openingTarget
        : openingTarget === 0 || morph > 0
          ? 0
          : Math.min(1, guideProgress + dt / 1.0);
      guideTrace.value = guideProgress;
      const eased = progress * progress * (3 - 2 * progress);
      const angle = ANGLE * eased * (1 - morph);
      threshold.value = Math.cos(angle);
      opening.value = angle / ANGLE;
      enabled.value = angle > 0.0001 ? 1 : 0;
      // Reveal the well through the same aperture; the surface hides the rest while it opens.
      object.visible = angle > 0.0001;
      return (progress !== openingTarget || (openingTarget === 1 && guideProgress < 1)) && morph === 0;
    },
  };
}
