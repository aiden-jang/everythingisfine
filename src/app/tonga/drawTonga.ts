import { rings } from "../../geo/land";
import { DEG, toVec3 } from "../../geo/sphere";
import {
  ANTIPODE,
  WAVE_ORIGIN,
  antipode,
  clamp,
  infrared,
  layersAt,
  latestScan,
  orbit,
  sprite,
  vapor,
  waveAngle,
  waveOrigin,
  wavePoint,
  type Vector,
} from "./tongaTimeline";

type Context = CanvasRenderingContext2D;
type Pixel = [x: number, y: number, depth: number];
type Project = (point: Vector) => Pixel;
export interface Satellite {
  infrared: HTMLImageElement | null;
  vapor: HTMLImageElement | null;
}

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const geography = rings().flatMap((polygon) =>
  polygon.map((ring) => ring.map(([lon, lat]) => toVec3(lon!, lat!, 1))),
);
const grid = [
  ...Array.from({ length: 12 }, (_, i) =>
    Array.from({ length: 61 }, (_, j) => toVec3(i * 30, j * 3 - 90, 1)),
  ),
  ...Array.from({ length: 7 }, (_, i) =>
    Array.from({ length: 121 }, (_, j) => toVec3(j * 3 - 180, i * 20 - 60, 1)),
  ),
];
const bearings = Array.from({ length: 181 }, (_, i) => i * 2 * DEG);

function trace(ctx: Context, points: readonly Vector[], project: Project) {
  let previous: Pixel | undefined;
  for (const point of points) {
    const pixel = project(point);
    const [x, y, depth] = pixel;
    if (previous && depth >= 0 !== previous[2] >= 0) {
      const t = previous[2] / (previous[2] - depth);
      const at: [number, number] = [previous[0] + t * (x - previous[0]), previous[1] + t * (y - previous[1])];
      if (depth >= 0) ctx.moveTo(...at);
      else ctx.lineTo(...at);
    }
    if (depth >= 0) {
      if (previous) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    previous = pixel;
  }
}

function mapLines(ctx: Context, lines: Vector[][], project: Project, color: string, width: number) {
  ctx.beginPath();
  for (const points of lines) trace(ctx, points, project);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function surface(ctx: Context, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const light = ctx.createRadialGradient(x - r * 0.31, y - r * 0.31, 0, x, y, r);
  light.addColorStop(0, "#1e3e59");
  light.addColorStop(0.7, "#11263e");
  light.addColorStop(1, "#081427");
  ctx.fillStyle = light;
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = "#537b9f";
  ctx.lineWidth = 1.2;
  ctx.shadowBlur = 16;
  ctx.shadowColor = "#577997";
  ctx.stroke();
  ctx.restore();
  ctx.clip();
}

function marker(ctx: Context, project: Project, point: Vector, label: string, active: boolean) {
  const [x, y, depth] = project(point);
  if (depth < 0.1) return;
  ctx.beginPath();
  ctx.arc(x, y, active ? 6 : 3, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#d3edf5" : "#94b3c7";
  ctx.fill();
  if (!label) return;
  ctx.font = '500 11px "Geist Mono Variable", monospace';
  ctx.strokeStyle = "#081427";
  ctx.lineWidth = 3;
  ctx.strokeText(label, x + 10, y - 9);
  ctx.fillText(label, x + 10, y - 9);
}

function wave(ctx: Context, project: Project, minute: number) {
  const angle = waveAngle(minute);
  if (minute <= WAVE_ORIGIN || angle >= Math.PI) return;
  ctx.beginPath();
  trace(
    ctx,
    bearings.map((bearing) => wavePoint(angle, bearing)),
    project,
  );
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#92d6ed32";
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#b0e8f6";
  ctx.stroke();
}

function paintOrbit(
  ctx: Context,
  width: number,
  height: number,
  minute: number,
  station: { name: string; lat: number; lon: number },
  anchor: number,
) {
  const shot = orbit(anchor);
  const lon = shot.lon * DEG;
  const lat = shot.lat * DEG;
  const forward = toVec3(shot.lon, shot.lat, 1);
  const east: Vector = [Math.cos(lon), 0, -Math.sin(lon)];
  const north: Vector = [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)];
  const cos = Math.cos(shot.bank);
  const sin = Math.sin(shot.bank);
  const radius = Math.min(width * 0.44, height * 0.44) * shot.scale;
  const cx = width * 0.5;
  const cy = height * 0.49;
  const project: Project = (point) => {
    const x = dot(east, point);
    const y = dot(north, point);
    return [cx + (x * cos - y * sin) * radius, cy - (x * sin + y * cos) * radius, dot(forward, point)];
  };
  ctx.save();
  surface(ctx, cx, cy, radius);
  mapLines(ctx, grid, project, "#6e9ab338", 0.75);
  mapLines(ctx, geography, project, "#9abbd1bb", 1.1);
  wave(ctx, project, minute);
  ctx.restore();
  marker(ctx, project, waveOrigin, "Hunga Tonga", false);
  if (minute > 400 && minute < 900) {
    marker(ctx, project, toVec3(station.lon, station.lat, 1), station.name, true);
  }
  if (minute >= 1150) marker(ctx, project, antipode, "Antipode", minute >= ANTIPODE);
}

function tile(
  ctx: Context,
  image: HTMLImageElement,
  index: number,
  width: number,
  height: number,
  scale: number,
) {
  const w = sprite.width;
  const h = sprite.height;
  const fit = Math.max(width / w, height / h) * scale;
  const x = (width - w * fit) / 2;
  const y = (height - h * fit) / 2;
  ctx.drawImage(
    image,
    (index % sprite.columns) * w,
    Math.floor(index / sprite.columns) * h,
    w,
    h,
    x,
    y,
    w * fit,
    h * fit,
  );
}

export function paintTonga(
  ctx: Context,
  width: number,
  height: number,
  minute: number,
  images: Satellite,
  station: { name: string; lat: number; lon: number },
  anchor?: number,
) {
  const sky = ctx.createRadialGradient(
    width * 0.48,
    height * 0.48,
    0,
    width * 0.5,
    height * 0.5,
    width * 0.55,
  );
  sky.addColorStop(0, "#10223a");
  sky.addColorStop(1, "#060d19");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const { vaporMix, orbitMix } = layersAt(minute, !!images.infrared, !!images.vapor, anchor !== undefined);
  if (orbitMix > 0) {
    paintOrbit(ctx, width, height, minute, station, anchor ?? minute);
  }
  if (orbitMix === 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - orbitMix;
  if (images.infrared && vaporMix < 1) {
    tile(
      ctx,
      images.infrared,
      latestScan(infrared, minute),
      width,
      height,
      anchor === undefined ? 1 + clamp((minute - 250) / 40) * 0.14 : 1,
    );
  }
  if (images.vapor && vaporMix > 0) {
    ctx.globalAlpha *= vaporMix;
    tile(ctx, images.vapor, latestScan(vapor, minute), width, height, 1);
  }
  ctx.restore();
}
