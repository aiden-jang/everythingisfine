import { expect, test } from "vitest";
import { Group, Points, ShaderMaterial, Scene, PerspectiveCamera, type WebGLRenderer } from "three";
import { createObservationLayer } from "./observationLayer";
import { createSequencePresentation } from "./sequencePresentation";

test("story and sequence points retain their CSS size when drawing resolution changes", () => {
  const observation = createObservationLayer({ value: 0 });
  const sequence = createSequencePresentation({} as Parameters<typeof createSequencePresentation>[0]);
  const scene = new Scene(),
    camera = new PerspectiveCamera();
  const dot = observation.object.children.find((object) => object instanceof Points) as Points;
  try {
    for (const ratio of [2, 1.2, 1, 2]) {
      const renderer = { getPixelRatio: () => ratio } as WebGLRenderer;
      for (const [point, key] of [
        [dot, "pixelRatio"],
        [sequence.object, "uPixelRatio"],
      ] as const) {
        point.onBeforeRender(
          renderer,
          scene,
          camera,
          point.geometry,
          point.material as ShaderMaterial,
          new Group(),
        );
        expect((point.material as ShaderMaterial).uniforms[key]!.value).toBe(ratio);
      }
    }
  } finally {
    observation.dispose();
    observation.object.traverse((object) => {
      if ("geometry" in object) (object.geometry as { dispose: () => void }).dispose();
    });
    sequence.dispose();
  }
});
