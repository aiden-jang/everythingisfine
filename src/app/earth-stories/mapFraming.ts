import type { EarthStoryData } from "./types";
import type { CameraState } from "../../globe/controls";

export function storyMapTarget(data: EarthStoryData): CameraState {
  if (data.mapTarget) return data.mapTarget;
  if (data.lens || data.sky || data.frames.some((frame) => frame.orbit || frame.reconstruction))
    return data.target;
  const points = data.frames.flatMap((frame) => {
    if (frame.raster?.bounds) {
      const [west, south, east, north] = frame.raster.bounds;
      if (east - west >= 300) return [];
      return [
        { lon: west, lat: south },
        { lon: east, lat: north },
      ];
    }
    return frame.paths?.flatMap((path) => path.points) ?? [];
  });
  if (!points.length) return data.target;
  let west = Infinity,
    east = -Infinity,
    south = 90,
    north = -90;
  for (const point of points) {
    const lon = data.target.lon + ((((point.lon - data.target.lon) % 360) + 540) % 360) - 180;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  const width = east - west,
    height = north - south;
  if (width > 300 || height > 150) return { ...data.target, zoom: Math.min(1, data.target.zoom) };
  return {
    lon: (((((west + east) / 2 + 180) % 360) + 360) % 360) - 180,
    lat: (south + north) / 2,
    zoom: Math.min(2.6, Math.max(0.7, 160 / Math.max(40, width, height * 1.8))),
  };
}
