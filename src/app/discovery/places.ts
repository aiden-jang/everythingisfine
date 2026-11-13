export interface StoryPlace {
  lon: number;
  lat: number;
  label: string;
}

// Regional anchors match the story framing; they are locators, never observations.
export const storyPlaces: Record<string, StoryPlace> = {
  rupture: { lon: 142.37, lat: 38.3, label: "Tōhoku, Japan" },
  katrina: { lon: -89.6, lat: 29.3, label: "Gulf of Mexico · Louisiana" },
  tonga: { lon: -175.4, lat: -20.55, label: "Hunga Tonga" },
  megaflash: { lon: -96, lat: 33, label: "Southern United States" },
  kilauea: { lon: -154.9, lat: 19.5, label: "Kīlauea · Kapoho Bay" },
  lights: { lon: -66.45, lat: 18.2, label: "Puerto Rico" },
  seafloor: { lon: 144.6, lat: 13.5, label: "Mariana Trench" },
  glacier: { lon: -49.55, lat: 69.15, label: "Jakobshavn, Greenland" },
  "atmospheric-river": { lon: -143, lat: 38, label: "North Pacific" },
  bloom: { lon: -23, lat: 52, label: "North Atlantic" },
  aral: { lon: 59.5, lat: 45, label: "Aral Sea" },
  reef: { lon: -77, lat: 24, label: "Caribbean reefs" },
  dust: { lon: -47, lat: 22, label: "Tropical Atlantic" },
  ice: { lon: -35, lat: 76, label: "Arctic Ocean" },
  ozone: { lon: 15, lat: -76, label: "Antarctica" },
  fire: { lon: -120.9, lat: 40.25, label: "Northern California" },
  fault: { lon: -117.57, lat: 35.78, label: "Ridgecrest, California" },
  north: { lon: -90, lat: 77, label: "Canadian Arctic" },
};

export function storyPlace(id: string): StoryPlace | undefined {
  return storyPlaces[id.replace(/^(?:open-(?:(?:story|featured)-)?|search-story-|overview-story-)/, "")];
}
