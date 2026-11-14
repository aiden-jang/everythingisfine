import type { GlobeProps } from "../globe/GlobeProps";

const clear: Partial<GlobeProps> = {
  depthSink: false,
  cutaway: null,
  slab: null,
  figures: null,
  section: null,
  inspection: null,
};

export function storyBackdrop(browsing: boolean, focus: GlobeProps["cutaway"] = null): Partial<GlobeProps> {
  return browsing ? { ...clear, cutaway: focus ? { ...focus, cameraOnly: true } : null } : {};
}
