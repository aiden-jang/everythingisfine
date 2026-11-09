import type { EarthStoryId } from "./catalogue";

export const choices = {
  ozone: { label: "Compare season", options: ["2006", "2019"] },
  water: { label: "Region", options: ["California", "Northern California", "Central Valley"] },
  glacier: { label: "Annual velocity", options: ["2024", "2013"] },
  spring: { label: "Compare year", options: ["2024", "2023"] },
  bloom: { label: "Satellite view", options: ["Chlorophyll", "Natural color"] },
  "atmospheric-river": { label: "Forecast", options: ["Latest forecast", "9 November 2026 archive"] },
  reef: { label: "Heat stress", options: ["Recent observations", "2023 archive"] },
} as const;

export function storyChoices(id: EarthStoryId) {
  return id in choices ? choices[id as keyof typeof choices] : undefined;
}

export function storyChoice(id: EarthStoryId, requested?: string): string {
  const options: readonly string[] = storyChoices(id)?.options ?? [""];
  return requested && options.includes(requested) ? requested : options[0]!;
}

export function usesCity(id: EarthStoryId): boolean {
  return ["comet", "north", "apophis", "eclipse", "spring"].includes(id);
}
