import { coastRaster } from "../observations/replayGeometry";
import type { GeoPoint, ObservationPath, ObservationView } from "../observations/types";
import {
  coast,
  contours,
  epicenter,
  faults,
  geographicPoint,
  patchProgress,
  slipColor,
  type RuptureFrame,
} from "./ruptureModel";

const at = Date.parse("2011-03-11T05:46:24Z");
const color = (hex: string) => Number.parseInt(hex.slice(1), 16);
const origin = geographicPoint(epicenter);
export const ruptureTarget = { lon: 141.6, lat: 38.3, zoom: 2.2 };
export const ruptureLens = { globe: 2.75, map: 8 };
export const japan = coastRaster(
  coast.map((polygon) => polygon.map((ring) => ring.map(geographicPoint))),
  [126, 26, 156, 50],
);
const mesh = faults.map(({ corners, slip, ...patch }) => ({
  ...patch,
  points: [...corners, corners[0]!].map(geographicPoint),
  color: color(slipColor(slip)),
}));
const shaking = contours.flatMap(({ lines, color: hex }) =>
  lines.map((line) => ({ color: color(hex), points: line.map(geographicPoint) })),
);
const extent = shaking.reduce(
  ([west, east], { points }) => {
    for (const { lon } of points) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
    }
    return [west, east];
  },
  [Infinity, -Infinity],
);

function visibleShaking(progress: number): ObservationPath[] {
  if (progress >= 1) return shaking;
  const edge = extent[0]! + progress * (extent[1]! - extent[0]!);
  const paths: ObservationPath[] = [];
  for (const { points, color } of shaking) {
    let run: GeoPoint[] = [];
    const flush = () => {
      if (run.length > 1) paths.push({ color, points: run });
      run = [];
    };
    for (let i = 0; i < points.length; i++) {
      const b = points[i]!;
      const a = points[i - 1];
      if (a && a.lon <= edge !== b.lon <= edge) {
        run.push({ lon: edge, lat: a.lat + ((b.lat - a.lat) * (edge - a.lon)) / (b.lon - a.lon) });
        if (b.lon > edge) flush();
      }
      if (b.lon <= edge) run.push(b);
    }
    flush();
  }
  return paths;
}

export function ruptureGeography(frame: RuptureFrame): Pick<ObservationView, "frame" | "follow"> {
  const paths: ObservationPath[] =
    frame.depth > 0
      ? mesh.map(({ color, points, start, rise }) => ({
          points,
          color: patchProgress(frame.modelTime, start, rise) > 0 ? color : 0x3f586d,
        }))
      : [];
  if (frame.reveal > 0) paths.push(...visibleShaking(frame.reveal));
  return {
    frame: { at: at + frame.modelTime * 1000, paths, marks: [{ ...origin, size: 19, color: 0xeaf3fb }] },
    follow: {
      ...ruptureTarget,
      zoom: 1.95 + frame.camera.zoom * 0.25,
      bank: frame.camera.yaw * 0.19,
      pitch: frame.camera.tilt * 0.09,
    },
  };
}
