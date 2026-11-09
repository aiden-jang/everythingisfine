import type { ObservationPath, ObservationRaster, ObservationView } from "../observations/types";
import { bounds, lines, overview, trace, type flashFrame } from "./flashTimeline";

export const flashTarget = { lon: overview.lon, lat: overview.lat, zoom: 2.15 };
export const flashLens = { globe: 2.6, map: 7.3 };
const flashStart = Date.parse("2017-10-22T08:56:45.834Z");
const raster: ObservationRaster = {
  url: "",
  bounds: [bounds[0]!, bounds[1]!, bounds[2]!, bounds[3]!],
  opacity: 0.8,
};
const boundaries: ObservationPath[] = lines.map((points) => ({
  points: points.map(([lon, lat]) => ({ lon: lon!, lat: lat! })),
  color: 0x819ab0,
}));

export function flashGeography(
  { at, camera }: ReturnType<typeof flashFrame>,
  playing: boolean,
): Pick<ObservationView, "frame" | "follow"> {
  const marks = [];
  for (const [time, lon, lat] of trace) {
    if (time > at) break;
    const pulse = playing && at - time < 240;
    marks.push({ lon, lat, lift: 0.014, size: pulse ? 15 : 5, color: pulse ? 0xe8faff : 0x8ad7f3 });
  }
  return {
    frame: { at: flashStart + Math.max(0, at), paths: boundaries, marks, raster },
    follow: {
      lon: camera.lon,
      lat: camera.lat,
      zoom: 2.15 + (overview.height - camera.height) / 1150,
      bank: camera.roll,
      pitch: (1 - camera.tilt) * 0.27,
    },
  };
}
