import { earthStories, isEarthStory } from "./earth-stories/catalogue";
import { DEFAULT_CAMERA } from "../globe/framing";
import type { Permalink } from "./permalink";
import { stored } from "./stored";
import type { CutawayFocus } from "../globe/cutaway";
import { subsolarPoint } from "../geo/sun";
import type { EarthScene, Presentation } from "./useObservatory";

export function initialScene(shared: Partial<Permalink>): EarthScene {
  const id = shared.story?.id;
  if (id && isEarthStory(id)) return earthStories[id].scene;
  if (id === "rupture") return "depth";
  return ["lights", "shadow", "orbit", "sky", "moonfall"].includes(id ?? "")
    ? "night"
    : (shared.scene ?? "live");
}

export function initialPresentation(shared: Partial<Permalink>, read = stored): Presentation {
  if (shared.story) return "observe";
  if (shared.catalogue) return "explore";
  if (shared.section && !shared.presentation) return "explore";
  if (shared.presentation) return shared.presentation;
  if (shared.scene) return "observe";
  if (shared.event || shared.mark || shared.day || shared.cursor != null || shared.flat !== undefined)
    return "explore";
  const saved = read("presentation");
  if (saved === "observe" || saved === "explore") return saved;
  const preferences = [
    "railOpen",
    "head",
    "rail",
    "sheet",
    "flat",
    "ramp",
    "motion",
    "depthSink",
    "slab",
    "figures",
  ];
  return preferences.some((key) => read(key) !== null) ? "explore" : "observe";
}

export function earthSceneTarget(
  scene: EarthScene,
  deepest: CutawayFocus | null,
  at: number,
  home: { lon: number; lat: number; zoom: number } = DEFAULT_CAMERA,
): { scene: EarthScene; focus: CutawayFocus | null; camera: [number, number, number] } {
  if (scene === "depth" && deepest) {
    return { scene, focus: { ...deepest, dive: true }, camera: [deepest.lon, deepest.lat, 1.9] };
  }
  if (scene === "night") {
    const sun = subsolarPoint(at);
    return { scene, focus: null, camera: [sun.lon + 180, -sun.lat, 0.92] };
  }
  return { scene, focus: null, camera: [home.lon, home.lat, home.zoom] };
}
