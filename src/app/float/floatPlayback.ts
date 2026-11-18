import type { CameraState } from "../../globe/controlsTypes";
import type { ArgoProfile } from "../../sources/argo";

const ASCENT_SECONDS = 10.5;

export interface FloatReading {
  index: number;
  playing: boolean;
  inspecting: boolean;
  stage: "locate" | "rise" | "notice";
}

export type FloatDiveView = ReturnType<typeof createFloatPlayback>;

export function createFloatPlayback(profile: ArgoProfile, autoplay: boolean, source: "recent" | "recorded") {
  const listeners = new Set<() => void>();
  const samples = profile.samples;
  const deepest = samples[0]!.depth;
  const shallowest = samples.at(-1)!.depth;
  const span = deepest - shallowest;
  let current: FloatReading = { index: 0, playing: autoplay, inspecting: false, stage: "rise" };
  let depth = deepest;
  let destination: CameraState | undefined;

  function update(index: number, playing: boolean, changes: Partial<FloatReading> = {}) {
    const next = { ...current, index, playing, ...changes };
    if (
      Object.keys(next).every((key) => next[key as keyof FloatReading] === current[key as keyof FloatReading])
    )
      return;
    current = next;
    for (const listener of listeners) listener();
  }

  function seek(index: number) {
    if (!Number.isFinite(index)) return;
    const selected = Math.max(0, Math.min(samples.length - 1, Math.round(index)));
    depth = samples[selected]!.depth;
    update(selected, false, { stage: selected === samples.length - 1 ? "notice" : "rise" });
  }

  return {
    kind: "float-dive" as const,
    profile,
    source,
    depth: () => depth,
    depart: (camera: CameraState) => {
      destination = camera;
    },
    takeDestination() {
      const camera = destination;
      destination = undefined;
      return camera;
    },
    read: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    seek,
    inspect(inspecting: boolean) {
      update(current.index, inspecting ? false : current.playing, { inspecting });
    },
    locate() {
      update(current.index, false, { stage: "locate", inspecting: false });
    },
    rise() {
      update(current.index, false, { stage: "rise" });
    },
    notice() {
      seek(samples.length - 1);
      update(current.index, false, { stage: "notice", inspecting: false });
    },
    pause: () => update(current.index, false),
    toggle() {
      if (current.playing) update(current.index, false);
      else {
        if (current.index === samples.length - 1) seek(0);
        update(current.index, true, { stage: "rise" });
      }
    },
    step(dt: number) {
      if (!current.playing) return false;
      depth = Math.max(shallowest, depth - (dt / ASCENT_SECONDS) * span);
      let next = current.index;
      while (next < samples.length - 1 && samples[next + 1]!.depth >= depth) next++;
      update(next, depth > shallowest, { stage: depth > shallowest ? "rise" : "notice" });
      return current.playing;
    },
  };
}
