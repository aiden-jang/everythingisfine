import { DEG, EARTH_RADIUS_KM, toVec3 } from "../../geo/sphere";
import { coast, FIXES, LANDFALL, type stormFrame } from "./stormTrack";
import { stormProjection, type Vec } from "./stormProjection";

type Frame = ReturnType<typeof stormFrame>;
type Project = ReturnType<typeof stormProjection>["point"];
const nauticalMileKm = 1.852;
const region = coast.map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => toVec3(lon!, lat!, 1))));
const track = FIXES.map(({ lon, lat }) => toVec3(lon, lat, 1));
const cities = [
  { name: "New Orleans", point: toVec3(-90.07, 29.95, 1) },
  { name: "Tampa", point: toVec3(-82.46, 27.95, 1) },
];
const grid = [
  ...[-105, -100, -95, -90, -85, -80, -75].map((lon) =>
    Array.from({ length: 37 }, (_, i) => toVec3(lon, i + 12, 1)),
  ),
  ...[15, 20, 25, 30, 35, 40, 45].map((lat) => Array.from({ length: 49 }, (_, i) => toVec3(i - 113, lat, 1))),
];

function path(ctx: CanvasRenderingContext2D, project: Project, points: readonly Vec[]) {
  ctx.moveTo(...project(points[0]!));
  for (let i = 1; i < points.length; i++) ctx.lineTo(...project(points[i]!));
}

function paintOcean(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  limb: (x: number) => [number, number] | null,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#080f20");
  sky.addColorStop(0.4, "#18263b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  const steps = Math.ceil(width / 6);
  for (let i = 0; i <= steps; i++) {
    const x = (width * i) / steps;
    const edge = limb(x);
    if (!edge) continue;
    upper.push([x, edge[0]]);
    lower.push([x, edge[1]]);
  }
  ctx.beginPath();
  const outline = upper.concat(lower.reverse());
  if (outline.length > 0) {
    ctx.moveTo(...outline[0]!);
    for (let i = 1; i < outline.length; i++) ctx.lineTo(...outline[i]!);
    ctx.closePath();
    ctx.save();
    ctx.strokeStyle = "#738caa";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#648bb9";
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.restore();
  }
  ctx.clip();

  const water = ctx.createLinearGradient(0, 0, width * 0.28, height);
  water.addColorStop(0, "#244156");
  water.addColorStop(0.52, "#0d283e");
  water.addColorStop(1, "#071726");
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, width, height);
}

function paintGeography(ctx: CanvasRenderingContext2D, project: Project) {
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const line of grid) path(ctx, project, line);
  ctx.strokeStyle = "#6f98b335";
  ctx.stroke();

  ctx.beginPath();
  for (const polygon of region) {
    for (const ring of polygon) {
      path(ctx, project, ring);
      ctx.closePath();
    }
  }
  ctx.fillStyle = "#24384e";
  ctx.fill("evenodd");
  ctx.strokeStyle = "#6c8aa5";
  ctx.stroke();
}

function windPoint(lon: number, lat: number, bearing: number, radius: number): Vec {
  const phi = lat * DEG;
  const distance = (radius * nauticalMileKm) / EARTH_RADIUS_KM;
  const sinLat = Math.sin(phi) * Math.cos(distance) + Math.cos(phi) * Math.sin(distance) * Math.cos(bearing);
  const latitude = Math.asin(sinLat);
  const longitude =
    lon * DEG +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(phi),
      Math.cos(distance) - Math.sin(phi) * sinLat,
    );
  return toVec3(longitude / DEG, latitude / DEG, 1);
}

function windExtent(
  ctx: CanvasRenderingContext2D,
  project: Project,
  storm: Frame["storm"],
  radii: number[],
  strong: boolean,
) {
  ctx.save();
  ctx.beginPath();
  for (let q = 0; q < 4; q++) {
    const start = q * Math.PI * 0.5;
    for (let i = 0; i <= 12; i++) {
      const bearing = start + (i / 12) * Math.PI * 0.5;
      const pixel = project(windPoint(storm.lon, storm.lat, bearing, radii[q]!));
      if (q === 0 && i === 0) ctx.moveTo(...pixel);
      else ctx.lineTo(...pixel);
    }
  }
  ctx.closePath();
  ctx.fillStyle = strong ? "#e3ac5626" : "#8eb8cb18";
  ctx.strokeStyle = strong ? "#f1bd77b0" : "#a5c9d998";
  ctx.lineWidth = strong ? 1.3 : 1;
  if (!strong) ctx.setLineDash([4, 5]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function textAt(ctx: CanvasRenderingContext2D, value: string, x: number, y: number) {
  ctx.strokeStyle = "#081728";
  ctx.lineWidth = 3;
  ctx.strokeText(value, x, y);
  ctx.fillText(value, x, y);
}

function paintTrack(ctx: CanvasRenderingContext2D, project: Project, storm: Frame["storm"]) {
  const center = toVec3(storm.lon, storm.lat, 1);
  const [x, y] = project(center);
  ctx.save();
  ctx.beginPath();
  path(ctx, project, track);
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "#d5b08076";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  path(ctx, project, track.slice(0, storm.fixIndex + 1));
  ctx.lineTo(x, y);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ffcb8a";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#f9b36b";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (let i = 0; i < track.length; i++) {
    const [px, py] = project(track[i]!);
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = i <= storm.fixIndex ? "#ffd3a4" : "#a18b72";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x, y + 16);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#091625";
  ctx.stroke();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#ffe0b8";
  ctx.stroke();
  ctx.fillStyle = "#fff0dc";
  ctx.font = '600 11px "Geist Mono Variable", monospace';
  textAt(ctx, storm.fix.landfall ? "Buras landfall" : "Katrina", x + 17, y - 10);
  ctx.restore();
}

function paintPlaces(ctx: CanvasRenderingContext2D, project: Project, storm: Frame["storm"], width: number) {
  ctx.save();
  ctx.font = '500 10px "Geist Mono Variable", monospace';
  ctx.fillStyle = "#c0d1e1";
  ctx.textAlign = "right";
  const [eyeX, eyeY] = project(toVec3(storm.lon, storm.lat, 1));
  for (const { name, point } of cities) {
    if (width < 420 && name !== "New Orleans") continue;
    const [x, y] = project(point);
    if (name === "Tampa" && Math.abs(x - eyeX) < 100 && Math.abs(y - eyeY) < 20) continue;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    textAt(ctx, name, x - 6, y + (storm.fix.landfall ? -6 : 3));
  }
  if (!storm.fix.landfall) {
    const [x, y] = project(toVec3(LANDFALL.lon, LANDFALL.lat, 1));
    ctx.textAlign = "left";
    textAt(ctx, "Landfall", x + 6, y - 5);
  }
  ctx.restore();
}

export function drawStorm(ctx: CanvasRenderingContext2D, width: number, height: number, frame: Frame) {
  const { point, limb } = stormProjection(frame.camera, width, height);
  ctx.save();
  paintOcean(ctx, width, height, limb);
  paintGeography(ctx, point);
  if (frame.storm.r34) windExtent(ctx, point, frame.storm, frame.storm.r34, false);
  if (frame.storm.r64) windExtent(ctx, point, frame.storm, frame.storm.r64, true);
  paintPlaces(ctx, point, frame.storm, width);
  paintTrack(ctx, point, frame.storm);
  ctx.restore();
}
