import type { ArgoProfile } from "../../sources/argo";

const ASCENT_SECONDS = 10.5;

export interface FloatReading {
  index: number;
  playing: boolean;
}

export type FloatDiveView = ReturnType<typeof createFloatPlayback>;

export function createFloatPlayback(profile: ArgoProfile, autoplay: boolean, source: "recent" | "recorded") {
  const listeners = new Set<() => void>();
  const samples = profile.samples;
  const deepest = samples[0]!.depth;
  const shallowest = samples.at(-1)!.depth;
  const span = deepest - shallowest;
  let current: FloatReading = { index: 0, playing: autoplay };
  let depth = deepest;

  function update(index: number, playing: boolean) {
    if (current.index === index && current.playing === playing) return;
    current = { index, playing };
    for (const listener of listeners) listener();
  }

  function seek(index: number) {
    const selected = Math.max(0, Math.min(samples.length - 1, index));
    depth = samples[selected]!.depth;
    update(selected, false);
  }

  return {
    kind: "float-dive" as const,
    profile,
    source,
    depth: () => depth,
    read: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    seek,
    pause: () => update(current.index, false),
    toggle() {
      if (current.playing) update(current.index, false);
      else {
        if (current.index === samples.length - 1) seek(0);
        update(current.index, true);
      }
    },
    step(dt: number) {
      if (!current.playing) return false;
      depth = Math.max(shallowest, depth - (dt / ASCENT_SECONDS) * span);
      let next = current.index;
      while (next < samples.length - 1 && samples[next + 1]!.depth >= depth) next++;
      update(next, depth > shallowest);
      return current.playing;
    },
  };
}
