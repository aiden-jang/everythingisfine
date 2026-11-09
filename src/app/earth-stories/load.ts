import { cometStory } from "./cometStory";
import { faultStory, fireStory, northStory } from "./groundStories";
import { satelliteStory } from "./satelliteStories";
import type { EarthStoryId } from "./catalogue";
import type { EarthStoryData } from "./types";
import type { SkyCity } from "../../geo/tonight";

export async function loadEarthStory(
  id: EarthStoryId,
  choice: string,
  city: SkyCity,
): Promise<EarthStoryData> {
  if (id === "comet") return cometStory(city);
  if (id === "fault") return faultStory();
  if (id === "fire") return fireStory();
  if (id === "north") return northStory(city.name);
  return satelliteStory(id, choice);
}
