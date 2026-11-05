import { MORPH_GLSL } from "./morph";
import { RADIUS_NIGHT } from "../geo/land";

export const NIGHT_SURFACE = {
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
          vec2 auv = vec2(fract(vLonLat.x / 360.0), (vLonLat.y + 90.0) / 180.0);
          float glow = clamp(texture2D(uAurora, auv).r * 3.0, 0.0, 1.0) * night * uAuroraOn;

          /* A quarter of a level of noise, because this overlay's alpha changes by less than 1/255 over
             tens of pixels and an 8-bit framebuffer turns that into flat bands across Russia. See ARCHITECTURE.md#srcglobenightsurfacets. */
          float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float dither = (grain - 0.5) / 255.0;
          gl_FragColor = vec4(
            uDayColor * day + uAuroraColor * glow,
            night * uDepth + day * uLift + glow * 0.30 + dither
          );
        }`,
};
