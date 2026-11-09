import type { SkyCity } from "../../geo/tonight";
import type { AtlasStoryId } from "./atlasCatalogue";
import { aralStory, bloomStory, ninoStory, springStory } from "./atlasOcean";
import { apophisStory, eclipseStory } from "./atlasOrbits";
import { glacierStory, seafloorStory } from "./atlasTerrain";
import { reefStory } from "./reefData";
import { riverStory } from "./riverData";

export function atlasStory(id: AtlasStoryId, choice: string, city: SkyCity) {
  switch (id) {
    case "seafloor":
      return seafloorStory();
    case "apophis":
      return apophisStory(city);
    case "glacier":
      return glacierStory(choice);
    case "atmospheric-river":
      return riverStory(choice);
    case "eclipse":
      return eclipseStory(city);
    case "nino":
      return ninoStory();
    case "bloom":
      return bloomStory(choice);
    case "reef":
      return reefStory(choice);
    case "aral":
      return aralStory();
    case "spring":
      return springStory(choice, city);
  }
}
