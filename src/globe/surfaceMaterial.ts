import type { Material, Vector3 } from "three";

// Shape comes from the surface normal and displayed sun, without fabricated terrain or extra textures.
export function lightSurface(
  material: Material,
  sun: Vector3,
  morph: { value: number },
  ocean: boolean,
): void {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms["uSurfaceSun"] = { value: sun };
    shader.uniforms["uSurfaceMorph"] = morph;
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      `
      varying vec3 vSurfaceDirection;
      varying vec3 vSurfaceWorld;
      void main() {
        vSurfaceDirection = normalize(position);
        vSurfaceWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `
      uniform vec3 uSurfaceSun;
      uniform float uSurfaceMorph;
      varying vec3 vSurfaceDirection;
      varying vec3 vSurfaceWorld;
      void main() {
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      vec3 n = normalize(vSurfaceDirection);
      vec3 eye = normalize(cameraPosition - vSurfaceWorld);
      float daylight = smoothstep(-0.22, 0.85, dot(n, normalize(uSurfaceSun)));
      float facing = max(0.0, dot(n, eye));
      float body = mix(0.74, 1.16, daylight) * mix(0.58, 1.0, pow(facing, 0.35));
      ${ocean ? "body *= mix(0.9, 1.08, smoothstep(0.1, 0.9, daylight));" : ""}
      diffuseColor.rgb *= mix(body, 1.0, uSurfaceMorph);
    `,
    );
  };
  material.customProgramCacheKey = () => `${key}-surface-${ocean ? "ocean" : "land"}`;
}
