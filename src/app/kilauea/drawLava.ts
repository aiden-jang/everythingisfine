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
} from "./lavaTimeline";

type Context = CanvasRenderingContext2D;
type Polyline = number[][];
type Survey = { index: number; accent: number };

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
const grid = new Path2D();
for (let x = west; x <= east; x += 2000) {
  grid.moveTo(x, south);
  grid.lineTo(x, north);
}
for (let y = south; y <= north; y += 2000) {
  grid.moveTo(west, y);
  grid.lineTo(east, y);
}

interface SurfaceProjection {
  scale: number;
  install: (ctx: Context) => void;
  point: (coordinates: number[]) => [number, number];
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
  frame: Survey,
  relief: HTMLImageElement | null,
  projection: SurfaceProjection,
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
  footage: { index: number; opacity: number },
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

export function drawLavaSurface(
  canvas: HTMLCanvasElement,
  index: number,
  relief: HTMLImageElement | null,
  comparison: number | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const scale = width / (east - west);
  const projection: SurfaceProjection = {
    scale,
    install(context) {
      context.scale(scale, -height / (north - south));
      context.translate(-west, -north);
    },
    point: ([x, y]) => [(x! - west) * scale, ((north - y!) * height) / (north - south)],
  };
  ctx.fillStyle = "#112638";
  ctx.fillRect(0, 0, width, height);
  const frame = { index, accent: 0.9 };
  if (comparison === null) {
    paintSurvey(ctx, frame, relief, projection, "dated");
  } else {
    const center =
      comparison === 0
        ? width
        : comparison === 100
          ? 0
          : projection.point([bay[0]! - 650 + (0.5 - comparison / 100) * 13_000, 0])[0];
    for (const [start, extent, mode] of [
      [0, center, "before"],
      [center, width - center, "after"],
    ] as const) {
      if (extent <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(start, 0, extent, height);
      ctx.clip();
      paintSurvey(ctx, frame, relief, projection, mode);
      ctx.restore();
    }
    if (comparison > 0 && comparison < 100) {
      ctx.fillStyle = "#e2edf6";
      ctx.fillRect(center, 0, 2, height);
    }
  }
  place(ctx, projection.point(vent), "Fissure 8", width, height, true);
  place(ctx, projection.point(bay), "Kapoho Bay", width, height, true);
}

export function drawLavaFootage(canvas: HTMLCanvasElement, image: HTMLImageElement, elapsed: number) {
  const frame = Math.floor((elapsed * overflight.fps) / 1000);
  const ctx = canvas.getContext("2d");
  if (ctx)
    paintOverflight(
      ctx,
      image,
      { index: Math.min(overflight.count - 1, frame), opacity: 1 },
      canvas.width,
      canvas.height,
    );
  return frame >= overflight.count - 1;
}
