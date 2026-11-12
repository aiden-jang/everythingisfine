import type { EarthStoryData } from "./types";

export const nearestFrame = (data: EarthStoryData, at?: number) =>
  at === undefined
    ? 0
    : data.frames.reduce(
        (best, frame, i) => (Math.abs(frame.at - at) < Math.abs(data.frames[best]!.at - at) ? i : best),
        0,
      );
