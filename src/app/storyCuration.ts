import type { EarthScene } from "./useObservatory";

export const featuredStories = {
  live: {
    id: "float",
    note: "Measured ocean profiles · Argo",
    reason: "Follow a measured profile toward the surface.",
  },
  depth: {
    id: "rupture",
    note: "Recorded event · Japan, 2011",
    reason: "See where Tōhoku’s fault moved, then compare the recorded waves.",
  },
  night: {
    id: "moonfall",
    note: "Recorded journey · Apollo 17, 1972",
    reason: "Leave the night sky and follow the rover across Taurus–Littrow.",
  },
} as const;

export const catalogueFeature = {
  id: "tonga",
  note: "GOES-17 and ground pressure",
  reason: "Track the wave across the Pacific.",
} as const;

// An editorial sequence, rather than source-module insertion order.
export const storyOrder = [
  "float",
  "moonfall",
  "rupture",
  "katrina",
  "sky",
  "iceberg",
  "tonga",
  "shadow",
  "kilauea",
  "megaflash",
  "seafloor",
  "aral",
  "aurora",
  "radar",
  "lights",
  "deep",
  "nino",
  "fault",
  "drifter",
  "eclipse",
  "apophis",
  "comet",
  "meteors",
  "orbit",
  "sun",
  "epic",
  "swell",
  "glacier",
  "ice",
  "ozone",
  "water",
  "bloom",
  "reef",
  "spring",
  "dust",
  "smoke",
  "fire",
  "north",
  "tsunami",
  "rain",
  "tide",
  "lightning",
  "wind",
  "river",
  "air",
  "atmospheric-river",
] as const;
const priority = new Map<string, number>(storyOrder.map((id, index) => [id, index]));
export const storyRank = (id: string) => priority.get(id) ?? storyOrder.length;

export const sceneHighlights: Record<EarthScene, readonly string[]> = {
  live: ["katrina", "iceberg", "radar"],
  depth: ["seafloor", "nino", "deep"],
  night: ["sky", "aurora", "shadow"],
};
