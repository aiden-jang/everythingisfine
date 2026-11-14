import { onward } from "./catalogue";
import type { Visit } from "../visitor/library";

const connections: readonly { ids: readonly string[]; reason: string }[] = [
  {
    ids: ["sky", "moonfall", "meteors", "orbit", "comet", "apophis", "eclipse", "shadow", "epic"],
    reason: "Explore another view of space. Its observation or prediction uses its own date and viewpoint.",
  },
  {
    ids: ["aurora", "sun", "north"],
    reason:
      "Explore another part of Earth's magnetic environment. These separate measurements do not predict aurora visibility by themselves.",
  },
  {
    ids: ["aral", "water", "river", "rain", "atmospheric-river", "wind"],
    reason:
      "Explore water or its transport in another setting. These records have separate locations, times and measurement methods.",
  },
  {
    ids: ["float", "drifter", "swell", "tide", "tsunami", "seafloor", "nino", "reef", "bloom"],
    reason:
      "Explore another ocean measurement. Its location and time are independent of the view you just watched.",
  },
  {
    ids: ["iceberg", "glacier", "ice", "ozone"],
    reason:
      "Explore another polar record. Different instruments, regions and dates tell different parts of the story.",
  },
  {
    ids: ["rupture", "fault", "deep", "kilauea", "tonga"],
    reason: "Explore another process shaping Earth. These are separate events, not stages of the same event.",
  },
  {
    ids: ["katrina", "lights", "radar", "megaflash", "lightning"],
    reason:
      "Explore another atmospheric event or its aftermath. The source and time change with the next view.",
  },
  {
    ids: ["smoke", "air", "fire", "dust", "spring"],
    reason:
      "Explore another satellite or ground record of land and air. These independent records do not establish a causal connection.",
  },
];

export function recommendStory(
  active: string,
  recent: readonly Visit[],
  unavailable: (id: string) => unknown,
) {
  const primary = onward[active];
  if (!primary) return null;
  const group = connections.find(({ ids }) => ids.includes(active));
  const previous = recent.find(({ id }) => id !== active)?.id;
  const candidates = [...new Set([primary[0], ...(group?.ids ?? [])])].filter(
    (id) => id !== active && id !== previous && !unavailable(id),
  );
  const seen = new Map(recent.map(({ id, seen }) => [id, seen]));
  const next =
    candidates.find((id) => !seen.has(id)) ??
    candidates.sort((a, b) => (seen.get(a) ?? 0) - (seen.get(b) ?? 0))[0];
  if (!next) return null;
  return { id: next, reason: next === primary[0] ? primary[1] : group!.reason };
}
