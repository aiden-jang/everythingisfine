import { DEG, EARTH_RADIUS_KM, toVec3 } from "../../geo/sphere";
import {
  axes,
  coast,
  latestIndex,
  nameOf,
  positionAt,
  tracks,
  type Camera,
  type Photo,
  type Point,
  type driftFrame,
} from "./icebergTimeline";

type Context = CanvasRenderingContext2D;
type Vector = ReturnType<typeof toVec3>;
type Project = (point: Vector) => [number, number];
type Frame = ReturnType<typeof driftFrame>;

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = ([lon, lat]: Point) => toVec3(lon, lat, 1);
const polygons = coast.map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => vec([lon!, lat!]))));
const geographicFixes = tracks.map(({ fixes }) => fixes.map(([, lon, lat]) => vec([lon, lat])));
const southGeorgia = vec([-36.6, -54.28]);
const southOrkney = vec([-45.42, -60.58]);
const colors = ["#c0edff", "#92c3fb", "#cbb8ed", "#82dacd", "#e3d5b1", "#9fbad6"];

const grid = [
  ...Array.from({ length: 9 }, (_, i) =>
    Array.from({ length: 49 }, (_, j) => vec([-64 + i * 5, -67 + j * 0.5])),
  ),
  ...Array.from({ length: 6 }, (_, i) => Array.from({ length: 46 }, (_, j) => vec([-65 + j, -68 + i * 5]))),
];

function projection(camera: Camera, width: number, height: number) {
  const lat = camera.lat * DEG;
  const lon = camera.lon * DEG;
  const east: Vector = [Math.cos(lon), 0, -Math.sin(lon)];
  const north: Vector = [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)];
  const forward = vec([camera.lon, camera.lat]);
  const sin = Math.sin(camera.roll);
  const cos = Math.cos(camera.roll);
  const scale = Math.min(width / camera.span, (height * 1.58) / camera.span);
  const point: Project = (target) => {
    const x = dot(target, east);
    const y = dot(target, north);
    const tangent = Math.hypot(x, y);
    const angle = tangent > 1e-9 ? Math.atan2(tangent, dot(target, forward)) / tangent : 1;
    const u = x * angle * EARTH_RADIUS_KM * scale;
    const v = -y * angle * EARTH_RADIUS_KM * scale * camera.pitch;
    return [width * 0.5 + u * cos - v * sin, height * 0.5 + u * sin + v * cos];
  };
  return { point, scale };
}

function trace(ctx: Context, project: Project, line: Vector[]) {
  ctx.moveTo(...project(line[0]!));
  for (let i = 1; i < line.length; i++) ctx.lineTo(...project(line[i]!));
}

function map(ctx: Context, project: Project, width: number, height: number) {
  const sea = ctx.createLinearGradient(0, 0, width * 0.8, height);
  sea.addColorStop(0, "#0a1527");
  sea.addColorStop(0.58, "#14324b");
  sea.addColorStop(1, "#091a2e");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  for (const line of grid) trace(ctx, project, line);
  ctx.strokeStyle = "#7d9cb738";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.beginPath();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      trace(ctx, project, ring);
      ctx.closePath();
    }
  }
  ctx.fillStyle = "#324a5d";
  ctx.fill("evenodd");
  ctx.strokeStyle = "#8ea9bb";
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

function text(ctx: Context, title: string, x: number, y: number, width: number, color: string) {
  ctx.font = '600 11px "Geist Mono Variable", monospace';
  const left = x + ctx.measureText(title).width + 22 > width;
  const label = x + (left ? -8 : 8);
  ctx.textAlign = left ? "right" : "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "#071525";
  ctx.strokeText(title, label, y - 7);
  ctx.fillStyle = color;
  ctx.fillText(title, label, y - 7);
  ctx.textAlign = "left";
}

function place(ctx: Context, project: Project, vector: Vector, name: string, width: number, height: number) {
  const [x, y] = project(vector);
  if (x < 9 || x > width - 9 || y < 23 || y > height - 18) return;
  text(ctx, name, x, y, width, "#cbdce8");
}

function traceTrack(
  ctx: Context,
  project: Project,
  date: number,
  trackIndex: number,
  selected: string,
  width: number,
  height: number,
) {
  const track = tracks[trackIndex]!;
  const { fixes } = track;
  const current = latestIndex(fixes, date);
  if (current < 0) return;
  const followed = selected === track.id;
  const unfiltered = selected === "all";
  const parent = track.id === "A";
  const active = followed || (unfiltered && parent);
  const color = colors[trackIndex % colors.length]!;
  const vecs = geographicFixes[trackIndex]!;
  const position = positionAt(track, date, current);
  const mark = position ? project(vec(position)) : project(vecs[current]!);

  ctx.save();
  ctx.globalAlpha = active ? 1 : unfiltered ? 0.63 : 0.2;
  ctx.lineWidth = active ? 2 : 1.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= current; i++) {
    const p = project(vecs[i]!);
    if (i === 0 || fixes[i]![0] - fixes[i - 1]![0] !== 1) ctx.moveTo(...p);
    else ctx.lineTo(...p);
  }
  if (position) ctx.lineTo(...mark);
  if (active) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  const [x, y] = mark;
  ctx.beginPath();
  ctx.arc(x, y, active ? 4.5 : 3, 0, 2 * Math.PI);
  if (position) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.fillStyle = "#10253b";
    ctx.fill();
    ctx.stroke();
  }
  if (active && x >= 8 && x <= width - 8 && y >= 22 && y <= height - 12) {
    text(ctx, nameOf(track.id), x, y, width, color);
  }
  ctx.restore();
}

function parentAxis(ctx: Context, project: Project, day: number) {
  const axis = axes.find(([stamp]) => stamp === Math.floor(day));
  if (!axis) return;
  const [, lon1, lat1, lon2, lat2] = axis;
  ctx.beginPath();
  ctx.moveTo(...project(vec([lon1!, lat1!])));
  ctx.lineTo(...project(vec([lon2!, lat2!])));
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = "#d7e7ef";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.setLineDash([]);
}

function scaleBar(ctx: Context, scale: number, width: number, height: number) {
  const end = width - 20;
  const y = height - 17;
  const start = end - scale * 100;
  ctx.fillStyle = "#081626d9";
  ctx.fillRect(Math.min(start, end - 46) - 8, y - 22, Math.max(46, end - start) + 16, 30);
  ctx.beginPath();
  ctx.moveTo(start, y - 3);
  ctx.lineTo(start, y);
  ctx.lineTo(end, y);
  ctx.lineTo(end, y - 3);
  ctx.strokeStyle = "#d0e0ea";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = '500 10px "Geist Mono Variable", monospace';
  ctx.fillStyle = "#e8edf5";
  ctx.textAlign = "right";
  ctx.fillText("100 km", end, y - 7);
  ctx.textAlign = "left";
}

export type Images = Partial<Record<Photo, HTMLImageElement>>;

function paintPhoto(
  ctx: Context,
  shot: NonNullable<Frame["photo"]>,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const full = shot.id === "approach";
  const fit = full ? Math.max(width / w, height / h) : Math.min(width / w, (height * 1.18) / h);
  const scale = fit * (1 + (1 - shot.progress) * (full ? 0.16 : 0.045));
  ctx.save();
  ctx.globalAlpha = shot.opacity;
  ctx.fillStyle = "#081726";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, (width - w * scale) / 2, (height - h * scale) / 2, w * scale, h * scale);
  ctx.restore();
}

export function drawDrift(
  ctx: Context,
  width: number,
  height: number,
  frame: Frame,
  images: Images,
  selected: string,
) {
  const image = frame.photo && images[frame.photo.id];
  if (!image || frame.photo!.opacity < 1) {
    const { point, scale } = projection(frame.camera, width, height);
    map(ctx, point, width, height);
    place(ctx, point, southGeorgia, "South Georgia", width, height);
    if (width >= 550) place(ctx, point, southOrkney, "South Orkney Islands", width, height);
    if (selected === "A" || selected === "all") parentAxis(ctx, point, frame.day);
    const focus = tracks.findIndex((track) => track.id === selected);
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (i !== focus) traceTrack(ctx, point, frame.day, i, selected, width, height);
    }
    if (focus >= 0) traceTrack(ctx, point, frame.day, focus, selected, width, height);
    if (frame.camera.pitch === 1) scaleBar(ctx, scale, width, height);
  }
  if (image && frame.photo) paintPhoto(ctx, frame.photo, image, width, height);
}
