import { Group, type Object3D, type PerspectiveCamera } from "three";
import type { InspectionRun } from "../app/useEventInspection";
import type { Controls } from "./controls";
import { createRegionalFraming } from "./regionalFraming";
import { createSequencePresentation } from "./sequencePresentation";
import { createWavePresentation } from "./wavePresentation";

export function createEventPresentation(camera: PerspectiveCamera, controls: Controls, context: Object3D) {
  const framing = createRegionalFraming(camera, controls);
  const wave = createWavePresentation(framing);
  const sequence = createSequencePresentation(framing);
  const object = new Group();
  object.add(wave.object, sequence.object);
  let active: InspectionRun | null = null;
  return {
    object,
    set(run: InspectionRun | null): void {
      const regional = run?.kind === "sequence";
      context.visible = !regional;
      wave.set(run?.kind === "wave" ? run : null);
      sequence.set(regional ? run : null);
      active = run;
      if (!active) framing.release();
    },
    recordedAt: () => (active?.kind === "sequence" ? active.read().at : null),
    step(dt: number, reduced: boolean, spherical: boolean): boolean {
      if (!active) return framing.settle(dt, reduced || !spherical);
      return spherical && (active.kind === "sequence" ? sequence : wave).step(dt, reduced);
    },
    dispose(): void {
      wave.dispose();
      sequence.dispose();
    },
  };
}
