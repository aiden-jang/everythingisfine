import type { EarthStoryId } from "./catalogue";
import type { EarthStoryData } from "./types";

export const nearestFrame = (data: EarthStoryData, at?: number) =>
  at === undefined
    ? 0
    : data.frames.reduce(
        (best, frame, i) => (Math.abs(frame.at - at) < Math.abs(data.frames[best]!.at - at) ? i : best),
        0,
      );

export function openingFrame(data: EarthStoryData, id: EarthStoryId, restoredAt: number | undefined) {
  if ((id === "ozone" || id === "spring" || id === "glacier") && restoredAt !== undefined)
    restoredAt = Date.parse(
      `${new Date(data.frames[0]!.at).getUTCFullYear()}${new Date(restoredAt).toISOString().slice(4)}`,
    );
  return nearestFrame(data, restoredAt ?? data.openingAt);
}
