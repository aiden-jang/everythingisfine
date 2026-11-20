import type {
  ObservationMark,
  ObservationPath,
  ObservationRaster,
  ObservationView,
} from "../observations/types";
import { BIN, DURATION, bounds, lines, overview, trace, type flashFrame } from "./flashTimeline";

export const flashTarget = { lon: overview.lon, lat: overview.lat, zoom: 2.15 };
export const flashLens = { globe: 2.6, map: 7.3 };
export const flashStart = Date.parse("2017-10-22T08:56:45.834Z");
const raster: ObservationRaster = {
  url: "",
  bounds: [bounds[0]!, bounds[1]!, bounds[2]!, bounds[3]!],
  opacity: 0.8,
};
const boundaries: ObservationPath[] = lines.map((points) => ({
  points: points.map(([lon, lat]) => ({ lon: lon!, lat: lat! })),
  color: 0x819ab0,
}));

const detections: ObservationMark[] = trace.map(([elapsed, lon, lat]) => ({
  elapsed,
  lon,
  lat,
  lift: 0.014,
  size: 6,
  color: 0xb79af2,
}));

export type FlashPhase = "infrared" | "replay" | "extent" | "first" | "inspect";

export function flashGeography(
  { at, camera }: ReturnType<typeof flashFrame>,
  phase: FlashPhase,
  moving: boolean,
): Pick<ObservationView, "frame" | "follow"> {
  const before = at < 0;
  const complete = at >= DURATION;
  const inspecting = phase === "inspect";
  const from = inspecting ? Math.floor(Math.min(at, DURATION - 1) / BIN) * BIN : at - BIN;
  const to = inspecting ? Math.min(DURATION, from + BIN) : at + 0.001;
  const markWindow =
    inspecting || (phase === "replay" && !complete) ? { from, to, showAhead: inspecting } : undefined;
  const opening = phase === "first";
  const rasterAt = opening ? DURATION : at;
  return {
    frame: {
      at: Math.round(flashStart + Math.max(0, at)),
      paths: boundaries,
      ...(before ? {} : { marks: detections }),
      ...(opening
        ? { markWindow: { from: 0, to: BIN - 0.001, showAhead: false } }
        : markWindow && { markWindow }),
      raster: { ...raster, opacity: raster.opacity! - Math.min(1, Math.max(0, rasterAt) / 2200) * 0.47 },
    },
    follow: moving
      ? {
          lon: camera.lon,
          lat: camera.lat,
          zoom: 2.15 + (overview.height - camera.height) / 1150,
          bank: camera.roll,
          pitch: (1 - camera.tilt) * 0.27,
        }
      : undefined,
  };
}
