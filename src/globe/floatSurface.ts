import { Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector4 } from "three";

const water = /* glsl */ `
  uniform float reveal;
  uniform float ascent;
  uniform float aspect;
  uniform float motion;
  uniform vec4 bounds;
  uniform float departure;
  uniform vec2 anchor;
  varying vec2 screen;

  float capsule(vec2 p, vec2 a, vec2 b, float radius) {
    vec2 d = b - a;
    return length(p - a - d * clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0)) - radius;
  }

  void main() {
    vec2 uv = screen * 0.5 + 0.5;
    float fold = smoothstep(0.18, 1.0, departure);
    vec2 low = mix(bounds.xy, anchor - vec2(0.005), fold);
    vec2 high = mix(bounds.zw, anchor + vec2(0.005), fold);
    vec2 local = (uv - low) / (high - low);
    vec3 abyss = vec3(0.012, 0.025, 0.063);
    float veil = 0.76 * reveal * (1.0 - smoothstep(0.0, 0.42, departure));
    if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) {
      gl_FragColor = vec4(abyss, veil);
      return;
    }
    vec2 p = (local * 2.0 - 1.0) * vec2(aspect, 1.0);
    float height = 0.64 + 0.025 * sin(p.x * 6.0) + 0.012 * cos(p.x * 13.0) - 1.02 * smoothstep(0.0, 0.74, departure);
    float below = max(0.0, height - p.y);
    float light = mix(0.11, 1.0, pow(ascent, 2.4));
    vec3 blue = mix(vec3(0.025, 0.16, 0.24), vec3(0.12, 0.57, 0.62), light);
    vec3 color = mix(abyss, blue, exp(-below * mix(3.1, 1.3, light)));
    float shafts = pow(0.5 + 0.5 * cos(p.x * 9.0 + below * 3.0), 9.0)
      + 0.45 * pow(0.5 + 0.5 * cos(p.x * 17.0 - below * 5.0), 12.0);
    color += vec3(0.18, 0.38, 0.41) * shafts * exp(-below * 2.7) * light;
    float surface = smoothstep(height - 0.024, height + 0.007, p.y);
    vec3 sky = mix(vec3(0.075, 0.22, 0.27), vec3(0.018, 0.035, 0.074), smoothstep(height, 1.0, p.y));
    color = mix(color, sky, surface);
    color += vec3(0.23, 0.43, 0.42) * exp(-abs(p.y - height) * 128.0);

    float x = 0.0;
    vec2 flecks = p * 22.0 + vec2(ascent * 0.7, -ascent * 9.0) * motion;
    vec2 cell = floor(flecks);
    float seed = fract(sin(dot(cell, vec2(11.27, 47.83))) * 151.13);
    float grain = 1.0 - smoothstep(0.018, 0.065, length(fract(flecks) - vec2(seed, fract(seed * 7.9))));
    color += vec3(0.12, 0.23, 0.23) * grain * step(0.71, seed) * (1.0 - surface) * mix(0.36, 1.0, light);

    vec2 f = p - vec2(x, mix(-0.61, 0.51, ascent) - 0.99 * smoothstep(0.0, 0.74, departure));
    float halo = exp(-dot(f * vec2(1.6, 1.0), f * vec2(1.6, 1.0)) * 27.0);
    color += vec3(0.11, 0.16, 0.13) * halo;
    float lamp = exp(-length(f - vec2(0.0, 0.128)) * 30.0);
    color += vec3(0.35, 0.61, 0.54) * lamp;
    float body = capsule(f, vec2(0.0, -0.070), vec2(0.0, 0.052), 0.026);
    float mast = capsule(f, vec2(0.0, 0.048), vec2(0.0, 0.125), 0.0035);
    float seal = capsule(f, vec2(0.0, -0.022), vec2(0.0, -0.015), 0.027);
    vec3 hull = mix(vec3(0.82, 0.43, 0.17), vec3(1.0, 0.81, 0.48), 1.0 - smoothstep(-0.026, 0.028, f.x));
    hull = mix(hull, vec3(0.12, 0.16, 0.18), 1.0 - smoothstep(-0.002, 0.001, seal));
    color = mix(color, vec3(0.69, 0.85, 0.80), 1.0 - smoothstep(-0.001, 0.002, mast));
    color = mix(color, hull, 1.0 - smoothstep(-0.002, 0.002, body));
    color = mix(color, vec3(0.84, 1.0, 0.94), 1.0 - smoothstep(0.003, 0.009, length(f - vec2(0.0, 0.128))));
    color *= 1.0 - 0.24 * smoothstep(0.3, 1.55, length(screen * vec2(1.0, 0.72)));
    float tide = mix(-1.35, 1.26, reveal);
    float immersion = 1.0 - smoothstep(tide - 0.13, tide + 0.27, p.y + 0.04 * sin(p.x * 4.0));
    float edge = smoothstep(0.0, 0.018, local.x) * (1.0 - smoothstep(0.982, 1.0, local.x));
    edge *= smoothstep(0.0, 0.018, local.y) * (1.0 - smoothstep(height + 0.05, height + 0.16, p.y));
    // During the return, let the depth fall away beneath the waterline before the lens closes at the float.
    float air = smoothstep(0.05, 0.86, departure);
    float width = 1.0 - pow(abs(local.x * 2.0 - 1.0), 2.0);
    float thickness = mix(1.95, 0.19, air) * mix(1.0, max(0.038, width), air);
    float depthEdge = 1.0 - smoothstep(thickness * 0.65, thickness, below);
    float crest = mix(1.0, smoothstep(0.0, 0.36, width), air);
    float outgoing = mix(1.0, depthEdge * crest, smoothstep(0.02, 0.42, departure));
    float waterAlpha = mix(reveal, immersion, motion) * edge * outgoing * 0.98 * (1.0 - smoothstep(0.82, 1.0, departure));
    float under = veil * (1.0 - waterAlpha);
    float opacity = waterAlpha + under;
    gl_FragColor = vec4((color * waterAlpha + abyss * under) / max(opacity, 0.0001), opacity);
  }
`;

export function createFloatSurface() {
  const object = new Group();
  const bounds = new Vector4();
  const sheet = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms: {
        reveal: { value: 0 },
        ascent: { value: 0 },
        aspect: { value: 1 },
        motion: { value: 1 },
        bounds: { value: bounds },
        departure: { value: 0 },
        anchor: { value: new Vector2(0.5, 0.5) },
      },
      vertexShader: /* glsl */ `
        varying vec2 screen;
        void main() {
          screen = position.xy;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: water,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  sheet.renderOrder = 100;
  sheet.frustumCulled = false;
  sheet.visible = false;
  object.add(sheet);
  let inspection = 0;
  return {
    object,
    departure(amount: number, anchor?: { x: number; y: number }) {
      sheet.material.uniforms.departure!.value = amount;
      if (anchor) sheet.material.uniforms.anchor!.value.set(anchor.x, anchor.y);
    },
    draw(reveal: number, ascent: number, inspecting: number, reduced: boolean) {
      inspection = inspecting;
      sheet.visible = reveal > 0;
      sheet.material.uniforms.reveal!.value = reveal * reveal * (3 - 2 * reveal);
      sheet.material.uniforms.ascent!.value = ascent;
      sheet.material.uniforms.motion!.value = reduced ? 0 : 1;
    },
    size(width: number, height: number, clearance: number) {
      if (width <= 0 || height <= 0) return { x: 0.5, y: 0.5 };
      const compact = width < 600;
      const panel = compact ? Math.min(236, width * 0.64) : 280;
      bounds.set(0.025, clearance, 0.975 - (panel / width) * inspection, 0.98);
      sheet.material.uniforms.aspect!.value =
        ((bounds.z - bounds.x) * width) / ((bounds.w - bounds.y) * height);
      return {
        x: (bounds.x + bounds.z) / 2,
        y:
          bounds.y + ((-0.61 + 1.12 * sheet.material.uniforms.ascent!.value + 1) / 2) * (bounds.w - bounds.y),
      };
    },
  };
}
