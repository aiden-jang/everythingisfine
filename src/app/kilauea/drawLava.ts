import {
  LAST,
  bounds,
  sharedCoast,
  formerCoast,
  fissures,
  land,
  snapshots,
  overflight,
  vent,
  type Camera,
} from "./lavaTimeline";

type Context = CanvasRenderingContext2D;
type Polyline = number[][];
type Scene = ReturnType<typeof import("./lavaTimeline").lavaFrame>;

function pathOf(lines: Polyline[], closed = false) {
  const path = new Path2D();
  for (const line of lines) {
    const [first, ...rest] = line;
    if (!first) continue;
    path.moveTo(first[0]!, first[1]!);
    for (const [x, y] of rest) path.lineTo(x!, y!);
    if (closed) path.closePath();
  }
  return path;
}

const oldLand = pathOf(land.flat(), true);
const fixedCoast = pathOf(sharedCoast);
const oldCoast = pathOf(formerCoast);
const vents = pathOf(fissures);
let previous = new Path2D();
const mapped = snapshots.map((snapshot) => {
  const fresh = pathOf(snapshot.fresh.flat(), true);
  const flow = new Path2D(previous);
  flow.addPath(fresh);
  previous = flow;
  return { flow, fresh, delta: pathOf(snapshot.delta.flat(), true), coast: pathOf(snapshot.coast) };
});

const [west, south, east, north] = bounds as [number, number, number, number];
const bay = [9630, 2049];
const pahoa = [20, 900];
const grid = new Path2D();
for (let x = west; x <= east; x += 2000) {
  grid.moveTo(x, south);
  grid.lineTo(x, north);
}
for (let y = south; y <= north; y += 2000) {
  grid.moveTo(west, y);
  grid.lineTo(east, y);
}

function mapProjection(camera: Camera, width: number, height: number) {
  const scale = Math.min(width / (camera.span * 1.1), (height * 1.65) / camera.span);
  const cx = width / 2;
  const cy = height * 0.48;
  const cos = Math.cos(camera.roll);
  const sin = Math.sin(camera.roll);
  return {
    scale,
    install(ctx: Context) {
      ctx.translate(cx, cy);
      ctx.rotate(camera.roll);
      ctx.scale(scale, -scale * camera.pitch);
      ctx.translate(-camera.x, -camera.y);
    },
    point([x, y]: number[]): [number, number] {
      const u = (x! - camera.x) * scale;
      const v = (camera.y - y!) * scale * camera.pitch;
      return [cx + u * cos - v * sin, cy + u * sin + v * cos];
    },
  };
}

function paintReference(ctx: Context, relief: HTMLImageElement | null) {
  ctx.save();
  ctx.fillStyle = "#253a3b";
  ctx.fill(oldLand, "evenodd");
  if (relief) {
    ctx.clip(oldLand, "evenodd");
    ctx.scale(1, -1);
    ctx.drawImage(relief, west, -north, east - west, north - south);
  }
  ctx.restore();
}

function paintSurvey(
  ctx: Context,
  frame: Scene,
  relief: HTMLImageElement | null,
  projection: ReturnType<typeof mapProjection>,
  mode: "dated" | "before" | "after",
) {
  ctx.save();
  projection.install(ctx);
  const unit = 1 / projection.scale;
  ctx.lineWidth = 0.75 * unit;
  ctx.strokeStyle = "#819ab324";
  ctx.stroke(grid);
  paintReference(ctx, relief);

  const map = mapped[mode === "after" ? LAST : frame.index]!;
  if (mode !== "before") {
    ctx.fillStyle = mode === "after" ? "#5d392cce" : "#754233ce";
    ctx.fill(map.flow);
    if (mode === "dated") {
      ctx.save();
      ctx.globalAlpha = frame.accent;
      ctx.fillStyle = "#e88b53";
      ctx.shadowColor = "#eb743b9a";
      ctx.shadowBlur = 12;
      ctx.fill(map.fresh, "evenodd");
      ctx.restore();
      ctx.strokeStyle = "#ebaa77a0";
      ctx.stroke(map.fresh);
    }
    ctx.fillStyle = mode === "after" ? "#dc985e" : "#bc7348";
    ctx.fill(map.delta, "evenodd");
  }
  ctx.lineWidth = 1.15 * unit;
  ctx.strokeStyle = "#a2c1c2a8";
  ctx.stroke(fixedCoast);
  ctx.stroke(mode === "before" ? oldCoast : map.coast);
  if (mode === "after" || (mode === "dated" && frame.index >= LAST)) {
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.lineWidth = 2.65 * unit;
    ctx.strokeStyle = "#382a25";
    ctx.stroke(oldCoast);
    ctx.lineWidth = 1.15 * unit;
    ctx.strokeStyle = "#f9e6c5";
    ctx.stroke(oldCoast);
    ctx.setLineDash([]);
  }
  if (mode === "dated") {
    ctx.lineWidth = 2 * unit;
    ctx.strokeStyle = "#ffcf96";
    ctx.stroke(vents);
  }
  ctx.restore();
}

function paintOverflight(
  ctx: Context,
  image: HTMLImageElement,
  footage: NonNullable<Scene["footage"]>,
  width: number,
  height: number,
) {
  const { width: w, height: h, columns } = overflight;
  const scale = Math.max(width / w, height / h);
  ctx.save();
  ctx.globalAlpha = footage.opacity;
  ctx.drawImage(
    image,
    (footage.index % columns) * w,
    Math.floor(footage.index / columns) * h,
    w,
    h,
    (width - w * scale) / 2,
    (height - h * scale) / 2,
    w * scale,
    h * scale,
  );
  ctx.restore();
}

export interface LavaImages {
  relief: HTMLImageElement | null;
  flight: HTMLImageElement | null;
}

function place(
  ctx: Context,
  position: [number, number],
  title: string,
  width: number,
  height: number,
  accent = false,
) {
  const [x, y] = position;
  if (x < 12 || x > width - 12 || y < 15 || y > height - 25) return;
  ctx.save();
  ctx.font = '600 11px "Geist Mono Variable", monospace';
  const left = x + ctx.measureText(title).width + 20 > width;
  const label = x + (left ? -9 : 9);
  ctx.textAlign = left ? "right" : "left";
  ctx.strokeStyle = "#0c1620";
  ctx.lineWidth = 3.8;
  ctx.strokeText(title, label, y - 7);
  ctx.fillStyle = accent ? "#ffdab0" : "#d2e0e5";
  ctx.fillText(title, label, y - 7);
  ctx.beginPath();
  ctx.arc(x, y, accent ? 3 : 2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function scaleBar(ctx: Context, scale: number, width: number, height: number) {
  const km = scale * 1000;
  const end = width - 19;
  const start = end - km;
  const y = height - 15;
  ctx.fillStyle = "#07121fdb";
  ctx.fillRect(Math.min(start, end - 44) - 8, y - 22, Math.max(44, km) + 16, 30);
  ctx.strokeStyle = "#d9e6eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(start, y - 4);
  ctx.lineTo(start, y);
  ctx.lineTo(end, y);
  ctx.lineTo(end, y - 4);
  ctx.stroke();
  ctx.fillStyle = "#e8edf5";
  ctx.font = '500 10px "Geist Mono Variable", monospace';
  ctx.textAlign = "right";
  ctx.fillText("1 km", end, y - 8);
  ctx.textAlign = "left";
}

export function drawLava(
  ctx: Context,
  width: number,
  height: number,
  frame: Scene,
  images: LavaImages,
  comparison: number | null,
) {
  const wipe = comparison ?? frame.wipe;
  const projection = mapProjection(frame.camera, width, height);
  const sea = ctx.createLinearGradient(width * 0.13, 0, width, height);
  sea.addColorStop(0, "#0c1728");
  sea.addColorStop(0.58, "#112a3b");
  sea.addColorStop(1, "#142e40");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, width, height);
  if (wipe === null) {
    paintSurvey(ctx, frame, images.relief, projection, "dated");
    place(ctx, projection.point(vent), "Fissure 8", width, height, true);
    if (width >= 480 && frame.index < 7) place(ctx, projection.point(pahoa), "Pāhoa", width, height);
  } else {
    const split = width * (1 - wipe / 100);
    for (const [start, extent, mode] of [
      [0, split, "before"],
      [split, width - split, "after"],
    ] as const) {
      if (extent <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(start, 0, extent, height);
      ctx.clip();
      paintSurvey(ctx, frame, images.relief, projection, mode);
      ctx.restore();
    }
    if (wipe > 0 && wipe < 100) {
      ctx.beginPath();
      ctx.moveTo(split, 0);
      ctx.lineTo(split, height);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#e2edf6";
      ctx.stroke();
    }
  }
  place(ctx, projection.point(bay), "Kapoho Bay", width, height, true);
  if (frame.camera.pitch === 1) scaleBar(ctx, projection.scale, width, height);
  if (images.flight && frame.footage) paintOverflight(ctx, images.flight, frame.footage, width, height);
}
