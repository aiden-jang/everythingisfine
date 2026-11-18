import { coastRaster } from "../observations/replayGeometry";
import type { GeoPoint, ObservationFault, ObservationPath, ObservationView } from "../observations/types";
import {
  DEPTH_EXAGGERATION,
  coast,
  contours,
  epicenter,
  faults,
  geographicPoint,
  hypocenter,
  localPoint,
  slipColor,
  type Point,
  type RuptureFrame,
} from "./ruptureModel";

const at = Date.parse("2011-03-11T05:46:24Z");
const color = (hex: string) => Number.parseInt(hex.slice(1), 16);
const origin = geographicPoint(epicenter);
export const ruptureTarget = { lon: 141.6, lat: 38.3, zoom: 2.2 };
export const ruptureFaultTarget = { lon: 141.7, lat: 36.75, zoom: 2.3 };
export const ruptureShakingTarget = { lon: 141.35, lat: 38.08, zoom: 2.18 };
export const ruptureLens = { globe: 2.24, map: 6.7 };
export const japan = coastRaster(
  coast.map((polygon) => polygon.map((ring) => ring.map(geographicPoint))),
  [126, 26, 156, 50],
);
const faultPoint = (point: Point) => ({ ...geographicPoint(point), depth: point.depth });
const outline = [
  localPoint(141.35, 36.1),
  localPoint(144.5, 36.1),
  localPoint(144.5, 40.8),
  localPoint(141.35, 40.8),
].map(faultPoint);
const bed = outline.map((point) => ({ ...point, depth: 62 }));
const model: ObservationFault = {
  exaggeration: DEPTH_EXAGGERATION,
  patches: faults.map(({ corners, slip, ...patch }) => ({
    ...patch,
    corners: corners.map(faultPoint),
    tint: color(slipColor(slip)),
  })),
  guides: [
    ...outline.flatMap((point, i) => [
      point,
      outline[(i + 1) % outline.length]!,
      point,
      bed[i]!,
      bed[i]!,
      bed[(i + 1) % bed.length]!,
    ]),
    faultPoint(epicenter),
    faultPoint(hypocenter),
  ],
};
const epicenterMarks = [{ ...origin, size: 19, color: 0xeaf3fb }];
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
      const inside = b.lon <= edge;
      if (a && a.lon <= edge !== inside) {
        run.push({ lon: edge, lat: a.lat + ((b.lat - a.lat) * (edge - a.lon)) / (b.lon - a.lon) });
        if (!inside) flush();
      }
      if (inside) run.push(b);
    }
    flush();
  }
  return paths;
}

export function ruptureGeography(
  frame: RuptureFrame,
  moving = true,
): Pick<ObservationView, "frame" | "follow" | "fault"> {
  return {
    frame: {
      at: at + Math.round(frame.modelTime * 1000),
      raster: japan,
      ...(frame.reveal > 0 && { paths: visibleShaking(frame.reveal) }),
      marks: epicenterMarks,
    },
    ...(frame.depth > 0 && { fault: { model, seconds: frame.modelTime, amount: frame.depth } }),
    follow: moving
      ? {
          lon: 142.1 + frame.camera.east / 88,
          lat: 38.3 + frame.camera.north / 111,
          zoom: 1.95 + frame.camera.zoom * 0.25,
          bank: frame.camera.yaw * 0.19,
          pitch: frame.camera.tilt * 0.14,
        }
      : undefined,
  };
}
