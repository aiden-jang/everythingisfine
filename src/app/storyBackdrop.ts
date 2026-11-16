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

export function observatoryBackdrop(view: {
  browsingStories: boolean;
  depthFocus: GlobeProps["cutaway"];
  floatDive: { active: boolean };
}): Partial<GlobeProps> {
  return view.floatDive.active
    ? { ...clear, aurora: null }
    : storyBackdrop(view.browsingStories, view.depthFocus);
}
