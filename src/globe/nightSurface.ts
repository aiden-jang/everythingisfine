import { Color, FrontSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { attachLonLat, MORPH_GLSL, SPHERE_PHI_START } from "./morph";
import { AURORA_LAT, AURORA_LON } from "../sources/aurora";
import { auroraTexture } from "./auroraTexture";
import { RADIUS_NIGHT } from "../geo/land";

const NIGHT_SURFACE = {
  vertexShader: /* glsl */ `
        ${MORPH_GLSL}
        varying vec3 vNormal;
        varying vec2 vLonLat;
        void main() {
          // Object space: where the sun is depends on where a point is on Earth, not on where the projection
          // drew it, and the model matrix repeats the flat map sideways.
          vNormal = normalize(position);
          vLonLat = aLonLat;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(fmProject(position), 1.0);
        }`,
  fragmentShader: /* glsl */ `
        uniform vec3 uEclipse;
        uniform float uPenumbraAng;
        uniform float uUmbraAng;
        uniform vec3 uSun;
        uniform float uDayline;
        uniform vec3 uDayColor;
        uniform float uDepth;
        uniform float uLift;
        uniform float uMorph;
        uniform sampler2D uAurora;
        uniform float uAuroraOn;
        uniform vec3 uAuroraColor;
        varying vec3 vNormal;
        varying vec2 vLonLat;

        void main() {
          /* On the map, rebuild the direction per fragment. Flattening stretches these triangles, and an
             interpolated normal is only exact at their corners: a crease ran along every shared diagonal.
             See ARCHITECTURE.md#srcglobenightsurfacets. */
          float lam = radians(vLonLat.x);
          float phi = radians(vLonLat.y);
          float c = cos(phi);
          vec3 fromLonLat = vec3(c * sin(lam), sin(phi), c * cos(lam));
          float sun = dot(normalize(mix(normalize(vNormal), fromLonLat, uMorph)), normalize(uSun));

          /*
           * Darkens one side and lifts the other. Darkening alone reads as a disc with a shadow, not a lit ball.
           *
           * The two factors must not overlap. Where they do, a band of mid-grey reads as haze on the lens.
           */
          float night = smoothstep(0.10, -0.30, sun);
          float day = smoothstep(0.10, 0.55, sun);

          /* The moon's shadow, on the few days there is one. uPenumbraAng is zero otherwise, so almost
             every frame pays one compare for it. Move night and day together. Dimming the day alone leaves
             a grey shadow, which is not what being inside one looks like. See ARCHITECTURE.md#srcglobenightsurfacets. */
          float cover = 0.0;
          if (uPenumbraAng > 0.0) {
            float away = acos(clamp(dot(normalize(mix(normalize(vNormal), fromLonLat, uMorph)), uEclipse), -1.0, 1.0));
            cover = smoothstep(uPenumbraAng, uPenumbraAng * 0.08, away) * 0.88;
            if (uUmbraAng > 0.0) {
              cover = max(cover, smoothstep(uUmbraAng * 2.2, uUmbraAng, away));
            }
          }
          day *= 1.0 - cover;
          night = max(night, cover);

          /* Falls off toward the limb, or the lit side is a flat circle rather than a sphere. Take the day
             wash away rather than adding shadow. See ARCHITECTURE.md#srcglobenightsurfacets. */
          vec3 toEye = normalize(cameraPosition - vNormal * ${RADIUS_NIGHT});
          float edge = (1.0 - clamp(dot(vNormal, toEye), 0.0, 1.0)) * (1.0 - uMorph);
          day *= mix(1.0, 0.32, smoothstep(0.30, 0.94, edge));

          /* Aurora intensity shares the geographic night mask. See ARCHITECTURE.md#srcglobenightsurfacets. */
          vec2 auv = vec2((vLonLat.x + 0.5) / ${AURORA_LON}.0, (vLonLat.y + 90.5) / ${AURORA_LAT}.0);
          float glow = clamp(texture2D(uAurora, auv).r * 3.0, 0.0, 1.0) * night * uAuroraOn;

          /* A quarter of a level of noise, because this overlay's alpha changes by less than 1/255 over
             tens of pixels and an 8-bit framebuffer turns that into flat bands across Russia. See ARCHITECTURE.md#srcglobenightsurfacets. */
          float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float dither = (grain - 0.5) / 255.0;
          vec3 color = uDayColor * day + uAuroraColor * glow;
          float alpha = night * uDepth + day * uLift + glow * 0.30 + dither;
          if (uDayline > 0.0) {
            // Trace the contour of zero solar elevation from north to south.
            float width = clamp(fwidth(sun) * 1.65, 0.0015, 0.018);
            float contour = 1.0 - smoothstep(width * 0.28, width, abs(sun));
            float halo = 1.0 - smoothstep(width, width * 6.0, abs(sun));
            float latitude = 0.5 - normalize(vNormal).y * 0.5;
            float traced = smoothstep(0.0, 0.12, uDayline * 1.13 - latitude);
            float accent = (contour * 0.72 + halo * 0.16) * traced * (1.0 - uMorph);
            color = mix(color, vec3(0.64, 0.86, 0.93), clamp(accent * 1.45, 0.0, 1.0));
            alpha = max(alpha, accent);
          }
          gl_FragColor = vec4(color, alpha);
        }`,
};

export function createNightSurface(morph: { value: number }) {
  // Night is a shell below the data so light cannot change how event markers read.
  const dayline = { value: 0 };
  const aurora = auroraTexture();
  const nightGeom = new SphereGeometry(RADIUS_NIGHT, 96, 64, SPHERE_PHI_START);
  attachLonLat(nightGeom);
  const night = new Mesh(
    nightGeom,
    new ShaderMaterial({
      ...NIGHT_SURFACE,
      uniforms: {
        uMorph: morph,
        uSun: { value: new Vector3(0, 0, 1) },
        uDayline: dayline,
        /* Zero radii means no eclipse, which is every day but a handful a year. */
        uEclipse: { value: new Vector3(0, 0, 1) },
        uPenumbraAng: { value: 0 },
        uUmbraAng: { value: 0 },
        // Achromatic. A warm daylight would put hue on the one surface the data is drawn against.
        uDayColor: { value: new Color(0x9fb0cc) },
        uDepth: { value: 0.44 },
        uLift: { value: 0.11 },
        uAurora: { value: aurora },
        uAuroraOn: { value: 0 },
        uAuroraColor: { value: new Color(0x7fc9a6) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: FrontSide,
    }),
  );
  night.renderOrder = 4.5;
  return { night, aurora, dayline };
}
