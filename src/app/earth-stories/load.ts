import { cometStory } from "./cometStory";
import { faultStory, fireStory, northStory } from "./groundStories";
import { satelliteStory } from "./satelliteStories";
import type { EarthStoryId } from "./catalogue";
import type { EarthStoryData } from "./types";
import type { SkyCity } from "../../geo/tonight";
import { isAtlasStory } from "./atlasCatalogue";

export async function loadEarthStory(
  id: EarthStoryId,
  choice: string,
  city: SkyCity,
): Promise<EarthStoryData> {
  if (isAtlasStory(id)) {
    const { atlasStory } = await import("./atlasStories");
    return atlasStory(id, choice, city);
  }
  if (id === "comet") return cometStory(city);
  if (id === "fault") return faultStory();
  if (id === "fire") return fireStory();
  if (id === "north") return northStory(city.name);
  return satelliteStory(id, choice);
}
