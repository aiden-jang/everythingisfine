import { observations } from "./observations/catalogue";
import { earthStories } from "./earth-stories/catalogue";
import type { EarthScene } from "./useObservatory";

export interface SearchStory {
  id: string;
  title: string;
  summary: string;
  scene: EarthScene;
  keywords: string;
}
export const searchStories: readonly SearchStory[] = [
  ...Object.entries(observations).map(([id, value]) => ({
    id,
    title: value.title,
    summary: value.summary,
    scene: (id === "orbit" ? "night" : id === "deep" ? "depth" : "live") as EarthScene,
    keywords: `${value.group} ${value.source}`,
  })),
  ...Object.entries(earthStories).map(([id, value]) => ({
    id,
    ...value,
    keywords: `${value.location} ${value.source}`,
  })),
  {
    id: "rupture",
    title: "Rupture Reveal",
    summary: "Explore Tōhoku’s fault and recorded shaking.",
    scene: "depth",
    keywords: "Tohoku Japan earthquake 2011",
  },
  {
    id: "katrina",
    title: "Eye of the Storm",
    summary: "Follow Hurricane Katrina from the Gulf to landfall.",
    scene: "live",
    keywords: "Katrina hurricane 2005 NOAA",
  },
  {
    id: "tonga",
    title: "Tonga’s shockwave",
    summary: "See the eruption and its measured atmospheric pressure wave.",
    scene: "live",
    keywords: "Tonga 2022 Hunga volcano",
  },
  {
    id: "megaflash",
    title: "Megaflash",
    summary: "Follow satellite detections across five states.",
    scene: "live",
    keywords: "lightning GOES 2017",
  },
  {
    id: "kilauea",
    title: "Kīlauea",
    summary: "Follow lava from Fissure 8 to Kapoho Bay.",
    scene: "live",
    keywords: "Hawaii 2018 volcano coast",
  },
  {
    id: "lights",
    title: "Lights Return",
    summary: "Compare Puerto Rico’s lights after Hurricane Maria.",
    scene: "night",
    keywords: "Black Marble NASA 2017",
  },
  {
    id: "shadow",
    title: "Shadow Chase",
    summary: "Follow the 2027 eclipse and see it from your city.",
    scene: "night",
    keywords: "eclipse sun 2027",
  },
  {
    id: "sky",
    title: "Tonight’s Sky",
    summary: "Find the Moon and planets above your city.",
    scene: "night",
    keywords: "astronomy planets stargazing",
  },
  {
    id: "moonfall",
    title: "Moonfall",
    summary: "Descend to Apollo 17 and follow the rover route.",
    scene: "night",
    keywords: "moon lunar NASA 1972",
  },
  {
    id: "meteors",
    title: "Meteor Nights",
    summary: "Find dark windows for meteor showers.",
    scene: "night",
    keywords: "shooting stars Perseids Geminids",
  },
  {
    id: "aurora",
    title: "Aurora Overflight",
    summary: "Fly through NOAA’s current aurora forecast.",
    scene: "night",
    keywords: "northern southern lights polar oval live",
  },
  {
    id: "sun",
    title: "Sun Watch",
    summary: "Inspect current solar wind and X-rays.",
    scene: "night",
    keywords: "NOAA solar live",
  },
  {
    id: "radar",
    title: "Storm Radar",
    summary: "Scrub recent radar from around the world on the globe.",
    scene: "live",
    keywords: "rain weather live",
  },
  {
    id: "float",
    title: "Float Dive",
    summary: "Rise through an Argo temperature and salinity profile.",
    scene: "live",
    keywords: "ocean water",
  },
];
export const normalizeStoryQuery = (query: string) =>
  query.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
export function findStories(query: string, scene: EarthScene | null = null): readonly SearchStory[] {
  const terms = normalizeStoryQuery(query).split(/\s+/).filter(Boolean);
  return terms.length
    ? searchStories.filter(
        (story) =>
          (!scene || story.scene === scene) &&
          terms.every((term) =>
            normalizeStoryQuery(`${story.title} ${story.summary} ${story.keywords}`).includes(term),
          ),
      )
    : [];
}
