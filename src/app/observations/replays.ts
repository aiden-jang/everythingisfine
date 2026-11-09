export const replays = {
  rupture: { day: "2011-03-11", label: "Watch Tōhoku rupture" },
  katrina: { day: "2005-08-29", label: "Follow Hurricane Katrina" },
  tonga: { day: "2022-01-15", label: "Watch Tonga’s shockwave" },
  megaflash: { day: "2017-10-22", label: "Watch Megaflash" },
} as const;

export type ReplayId = keyof typeof replays;
export const replayIds = Object.keys(replays) as ReplayId[];
export function isReplay(entry: string): entry is ReplayId {
  return Object.hasOwn(replays, entry);
}
