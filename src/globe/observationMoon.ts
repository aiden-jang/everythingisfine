import { Mesh, ShaderMaterial, SphereGeometry, SRGBColorSpace, Texture, Vector3 } from "three";
import type { ObservationView } from "../app/observations/types";
import { toVec3 } from "../geo/sphere";
import { MORPH_GLSL } from "./morph";

export function createObservationMoon(morph: { value: number }) {
  const material = new ShaderMaterial({
    uniforms: {
      uMorph: morph,
      map: { value: null as Texture | null },
      moon: { value: new Vector3() },
      sun: { value: new Vector3() },
      sunDistance: { value: 23480 },
      imageReady: { value: false },
    },
    vertexShader: `${MORPH_GLSL}
      uniform vec3 moon; varying vec3 place; varying vec3 surfaceNormal; varying vec2 sampleAt;
      void main(){
        sampleAt=uv; surfaceNormal=normalize(mat3(modelMatrix)*normal);
        place=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(place,1.0);
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; uniform float sunDistance;
      uniform float uMorph; uniform bool imageReady;
      varying vec3 place; varying vec3 surfaceNormal; varying vec2 sampleAt;
      void main(){
        float behind=-dot(place,sun);
        float lateral=length(place+sun*behind);
        float umbra=1.02-behind*(109.198-1.02)/sunDistance;
        float penumbra=1.02+behind*(109.198+1.02)/sunDistance;
        float core=behind>0.0 ? 1.0-smoothstep(umbra-0.008,umbra+0.008,lateral) : 0.0;
        float fringe=behind>0.0 ? 1.0-smoothstep(umbra,penumbra,lateral) : 0.0;
        float lit=dot(normalize(surfaceNormal),sun);
        vec3 albedo=imageReady ? texture2D(map,sampleAt).rgb : vec3(0.65);
        vec3 daylight=albedo*(0.38+0.62*pow(max(0.0,lit),0.3))*(1.0-fringe*0.5);
        vec3 red=albedo*vec3(0.56,0.17,0.08);
        gl_FragColor=vec4(mix(daylight,red,core),(1.0-uMorph)*smoothstep(-0.05,0.02,lit));
        #include <colorspace_fragment>
      }`,
    transparent: true,
  });
  const object = new Mesh(new SphereGeometry(1737.4 / 6371, 64, 48), material);
  object.visible = false;
  object.frustumCulled = false;
  let image: HTMLImageElement | null | undefined;
  return {
    object,
    set(view: ObservationView | null) {
      const eclipse = view?.frame.orbit?.eclipse;
      object.visible = !!eclipse;
      if (!eclipse) return;
      object.position.set(...toVec3(eclipse.moon.lon, eclipse.moon.lat, 1 + eclipse.moon.lift!));
      object.lookAt(0, 0, 0);
      material.uniforms.sun!.value.set(...toVec3(eclipse.sun.lon, eclipse.sun.lat, 1));
      material.uniforms.sunDistance!.value = eclipse.sunDistance;
      if (image !== view?.moonImage) {
        material.uniforms.map!.value?.dispose();
        image = view?.moonImage;
        const texture = image ? new Texture(image) : null;
        if (texture) {
          texture.colorSpace = SRGBColorSpace;
          texture.needsUpdate = true;
        }
        material.uniforms.map!.value = texture;
        material.uniforms.imageReady!.value = !!texture;
      }
    },
    dispose() {
      material.uniforms.map!.value?.dispose();
      material.dispose();
      object.geometry.dispose();
    },
  };
}
