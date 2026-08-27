import { Color, Mesh, ShaderMaterial, SphereGeometry, type Vector3 } from "three";
import { moonPosition, moonRadii, MOON_RADIUS_KM } from "../geo/moon";
import { toVec3 } from "../geo/sphere";

/*
 * The moon, at its real distance, its real size, and its real phase.
 *
 * Nothing is scaled for effect, and the result is small: sixty radii out and a quarter of a radius across is
 * half a degree, about eleven pixels. The familiar enormous moon of photographs is a long lens.
 *
 * The phase is not computed anywhere. The scene already knows which way the sun is, and a sphere lit from
 * that direction produces the crescent and - the part hand-rolled phase code gets wrong - which way the
 * horns point. The sun is four hundred times further away than the moon, so one uniform serves both.
 *
 * No texture: at eleven pixels a map of the maria contributes nothing.
 *
 * Transparent, but it writes depth. It has to draw after the stars to cover them and fade with the morph,
 * which rules out the opaque pass, and writing depth is what keeps it solid over a star.
 */

/** Lunar grey, faintly warm, and kept well inside the chroma the interface allows anything painted. */
const COLOR_MOON = new Color(0xb8b4ae);

/*
 * The eclipsed moon, and the one place this app admits a warm hue on purpose.
 *
 * Not a second exception to the hue ban - the same one, from the far end of the ray. The light reaching a
 * totally eclipsed moon is sunlight refracted through the Earth's atmosphere, which is the sunset ring
 * around the planet, which is the rim.
 *
 * Dim as well as red. A total lunar eclipse is roughly ten thousand times fainter than a full moon, drawn
 * here at a fifth: a physically faithful brightness would be a moon that had simply gone.
 */
const COLOR_ECLIPSED = new Color(0x6e3a2c);

/** In globe radii, from the real numbers. */
const MOON_SIZE = moonRadii(MOON_RADIUS_KM);

const MOON = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      // The mesh is only ever translated, never rotated or scaled, so the normal needs no correction.
      vNormal = normalize(normal);
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uEclipsed;
    uniform float uUmbral;
    uniform vec3 uSun;
    uniform float uOpacity;
    varying vec3 vNormal;

    void main() {
      float lit = dot(vNormal, normalize(uSun));

      /*
        A hard terminator, because the moon has no atmosphere to soften one. The Earth's night wash fades
        over several degrees because air scatters light round the limb; copying that here would be a
        borrowed effect. The narrow smoothstep is antialiasing and nothing else.
      */
      float day = smoothstep(-0.02, 0.06, lit);

      /*
        Limb darkening, which on the moon is the opposite of subtle. A Lambert sphere renders full moon as a
        bright centre fading to a dark rim, and the real one is famously flat to the edge, because the
        regolith backscatters.
      */
      float shade = mix(0.72, 1.0, pow(max(lit, 0.0), 0.35));
      if (day < 0.004) discard;

      /*
        The Earth's shadow, which does not care which way the moon is facing. A phase is a lighting term and
        an eclipse is not: what has been taken away is the source rather than the angle, so this is mixed
        over the result instead of folded into the day term.

        No falloff across the face. The real umbra edge crosses a disc eleven pixels wide.
      */
      vec3 body = mix(uColor * shade, uEclipsed * mix(1.0, 0.55, uUmbral), uUmbral);
      gl_FragColor = vec4(body, day * uOpacity);
    }`,
};

export interface MoonLayer {
  object: Mesh;
  /** Places it for the moment on screen. Called wherever the sun is aimed, from the same clock. */
  setTime: (at: number, sunDir: Vector3) => void;
  /** How much of the face the Earth's shadow covers, 0 to 1. */
  setUmbral: (value: number) => void;
  /** Fades with the morph to the flat map, which has no sky to hang a moon in. */
  setOpacity: (value: number) => void;
  dispose: () => void;
}

export function createMoon(): MoonLayer {
  // Enough segments that an eleven-pixel disc has a round edge and a straight terminator. 48 by 32 puts a
  // vertex every seven and a half degrees, well under a pixel at this apparent size.
  const geometry = new SphereGeometry(MOON_SIZE, 48, 32);
  const material = new ShaderMaterial({
    ...MOON,
    uniforms: {
      uColor: { value: COLOR_MOON },
      uEclipsed: { value: COLOR_ECLIPSED },
      // 0 on all but a couple of days a year. See `lunarEclipse`.
      uUmbral: { value: 0 },
      uSun: { value: null },
      uOpacity: { value: 1 },
    },
    transparent: true,
    // Solid despite being transparent: see the note above. This is what lets it cover a star.
    depthWrite: true,
  });

  const object = new Mesh(geometry, material);
  // After the sky and before everything belonging to the planet.
  object.renderOrder = -1.5;

  return {
    object,
    setTime: (at, sunDir) => {
      const { lon, lat, distanceKm } = moonPosition(at);
      const [x, y, z] = toVec3(lon, lat, moonRadii(distanceKm));
      object.position.set(x, y, z);
      material.uniforms["uSun"]!.value = sunDir;
    },
    setUmbral: (value) => {
      material.uniforms["uUmbral"]!.value = Math.max(0, Math.min(1, value));
    },
    setOpacity: (value) => {
      material.uniforms["uOpacity"]!.value = value;
      object.visible = value > 0.001;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
