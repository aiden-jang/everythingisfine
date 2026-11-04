import { MORPH_GLSL } from "./morph";

/*
 * The blue haze on the rim. The one hue in this app that means nothing; DESIGN.md 3.1 allows it.
 *
 * Don't rewrite it as a fresnel term. Fresnel peaks at the shell's edge, not the planet's, which draws a
 * bright ring floating off the globe with a dark gap inside it.
 */
export const ATMOSPHERE = {
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uOuter;
    uniform vec3 uSun;
    varying vec3 vWorld;
    void main() {
      vec3 dir = normalize(vWorld - cameraPosition);
      float b = length(cross(dir, cameraPosition));
      float t = clamp((b - 1.0) / (uOuter - 1.0), 0.0, 1.0);

      /*
       * Brighter where the air is in sunlight, or the halo reads as a decal stuck on the planet. Brightness
       * only: warming it toward orange would be a big non-data orange next to a scale made of colour.
       *
       * No backticks anywhere in this shader. One of them ends the template literal holding it.
       */
      vec3 nearest = normalize(cameraPosition + dir * -dot(cameraPosition, dir));
      float sun = mix(0.34, 1.0, smoothstep(-0.28, 0.42, dot(nearest, uSun)));

      gl_FragColor = vec4(uColor, pow(1.0 - t, 2.6) * uIntensity * sun);
    }`,
};

export const GLINT_RADIUS = 1.0015;

export const GLINT = {
  vertexShader: /* glsl */ `
    ${MORPH_GLSL}
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      // Object space: the model matrix repeats the flat map sideways and would move the sun on every copy.
      vNormal = normalize(position);
      vec3 projected = fmProject(position);
      vWorld = (modelMatrix * vec4(projected, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uSun;
    uniform float uIntensity;
    uniform float uPower;
    varying vec3 vNormal;
    varying vec3 vWorld;

    void main() {
      vec3 n = normalize(vNormal);
      vec3 toEye = normalize(cameraPosition - vWorld);
      if (dot(n, toEye) <= 0.0) discard;
      /* A wide exponent on purpose: a mirror gives a point of light and a real sea gives a broad lobe.
         No backticks in here - one of them ends the template literal. */
      float spec = pow(max(dot(reflect(-normalize(uSun), n), toEye), 0.0), uPower);
      if (spec <= 0.002) discard;
      gl_FragColor = vec4(uColor, spec * uIntensity);
    }`,
};
