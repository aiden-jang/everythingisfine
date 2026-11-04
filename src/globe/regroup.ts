import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";

// Crossfade recorded positions. Flying epicentres between cells would imply locations that never happened.
export function createRegroup(source: Points<BufferGeometry, ShaderMaterial>) {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
    geometry.setAttribute(
      name,
      new BufferAttribute(new Float32Array(attribute.array.length), attribute.itemSize).setUsage(35048),
    );
  }
  const material = new ShaderMaterial({
    vertexShader: source.material.vertexShader,
    fragmentShader: source.material.fragmentShader,
    uniforms: { ...source.material.uniforms, uOpacity: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const object = new Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = source.renderOrder - 0.01;
  object.visible = false;
  let progress = 1,
    quiet = 0;
  const finish = (): void => {
    progress = 1;
    quiet = 0;
    source.material.uniforms["uOpacity"]!.value = 1;
    object.visible = false;
  };
  return {
    object,
    begin(reduced: boolean): void {
      if (reduced) {
        finish();
        return;
      }
      if (quiet === 0 && source.geometry.drawRange.count > 0) {
        const count = source.geometry.drawRange.count;
        for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
          const target = geometry.getAttribute(name) as BufferAttribute;
          (target.array as Float32Array).set(
            (attribute.array as Float32Array).subarray(0, count * attribute.itemSize),
          );
          target.addUpdateRange(0, count * attribute.itemSize);
          target.needsUpdate = true;
        }
        geometry.setDrawRange(0, count);
        progress = 0;
        object.visible = true;
      }
      quiet = 0.18;
    },
    step(dt: number, reduced: boolean): boolean {
      if (reduced) {
        finish();
        return false;
      }
      quiet = Math.max(0, quiet - dt);
      progress = Math.min(1, progress + dt / 0.2);
      const ease = progress * progress * (3 - 2 * progress);
      source.material.uniforms["uOpacity"]!.value = ease;
      material.uniforms["uOpacity"]!.value = 1 - ease;
      object.visible = progress < 1;
      return progress < 1 || quiet > 0;
    },
    cancel: finish,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
