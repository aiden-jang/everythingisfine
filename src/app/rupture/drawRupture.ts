import {
  DEPTH_EXAGGERATION,
  MODEL_SECONDS,
  coast,
  contours,
  epicenter,
  faults,
  hypocenter,
  localPoint,
  patchProgress,
  slipColor,
  type Point,
  type RuptureFrame,
} from "./ruptureModel";

type Screen = readonly [number, number];
type Project = (point: Point) => Screen;

const sheet = { west: -750, east: 870, south: -825, north: 800 };
const onMap = (east: number, north: number, depth = 0): Point => ({ east, north, depth });
const corners = (depth = 0) => [
  onMap(sheet.west, sheet.south, depth),
  onMap(sheet.east, sheet.south, depth),
  onMap(sheet.east, sheet.north, depth),
  onMap(sheet.west, sheet.north, depth),
];
const surface = corners();
const bed = corners(65);
const modelCorners = faults.flatMap((fault) => fault.corners);
const depthGuides = [
  modelCorners.reduce((south, point) => (point.north < south.north ? point : south)),
  modelCorners.reduce((north, point) => (point.north > north.north ? point : north)),
];
const sendai = localPoint(140.8719, 38.2682);
const tokyo = localPoint(139.6917, 35.6895);
const cityLabels = [
  { name: "Sendai", point: sendai },
  { name: "Tokyo", point: tokyo },
];

function path(ctx: CanvasRenderingContext2D, project: Project, line: readonly Point[], closed = false) {
  ctx.moveTo(...project(line[0]!));
  for (let i = 1; i < line.length; i++) ctx.lineTo(...project(line[i]!));
  if (closed) ctx.closePath();
}

function projector(frame: RuptureFrame, width: number, height: number): Project {
  const { east, north, tilt, yaw, zoom } = frame.camera;
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const scale = Math.min(width / 1200, height / 1000) * zoom;
  return (point) => {
    const x = point.east - east;
    const y = point.north - north;
    const across = x * ca - y * sa;
    const forward = x * sa + y * ca;
    const z = -point.depth * DEPTH_EXAGGERATION;
    const perspective = 1 / (1 + (forward * st - z * ct) / 2300);
    return [
      width / 2 + across * scale * perspective,
      height * 0.46 - (forward * ct + z * st) * scale * perspective,
    ];
  };
}

function mapSheet(ctx: CanvasRenderingContext2D, project: Project, depth: number) {
  if (depth > 0) {
    ctx.beginPath();
    path(ctx, project, [surface[0]!, surface[1]!, bed[1]!, bed[0]!], true);
    ctx.fillStyle = `rgba(20, 40, 63, ${depth * 0.52})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(115, 154, 181, ${depth * 0.32})`;
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  path(ctx, project, surface, true);
  ctx.fillStyle = "#0d1b2d";
  ctx.fill();
  ctx.strokeStyle = "#3a5068";
  ctx.stroke();
  ctx.clip();

  ctx.beginPath();
  for (let east = -600; east <= 800; east += 200) {
    path(ctx, project, [onMap(east, sheet.south), onMap(east, sheet.north)]);
  }
  for (let north = -800; north <= 800; north += 200) {
    path(ctx, project, [onMap(sheet.west, north), onMap(sheet.east, north)]);
  }
  ctx.strokeStyle = "#23364c";
  ctx.stroke();

  ctx.beginPath();
  for (const polygon of coast) {
    for (const ring of polygon) path(ctx, project, ring, true);
  }
  ctx.fillStyle = "#26374d";
  ctx.fill("evenodd");
  ctx.strokeStyle = "#657c95";
  ctx.stroke();
  ctx.restore();
}

function drawFault(ctx: CanvasRenderingContext2D, project: Project, frame: RuptureFrame) {
  const { depth, modelTime } = frame;
  ctx.save();
  ctx.beginPath();
  for (const point of depthGuides) {
    path(ctx, project, [onMap(point.east, point.north), point]);
  }
  ctx.globalAlpha = depth * 0.6;
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "#7899b4";
  ctx.stroke();
  ctx.setLineDash([]);

  for (const { slip, start, rise, corners } of faults) {
    const amount = patchProgress(modelTime, start, rise);
    ctx.beginPath();
    path(ctx, project, corners, true);
    ctx.globalAlpha = (0.12 + amount * 0.86) * depth;
    ctx.fillStyle = amount > 0 ? slipColor(slip) : "#284157";
    ctx.fill();
    ctx.globalAlpha = (0.24 + amount * 0.26) * depth;
    ctx.strokeStyle = amount > 0 ? "#0b1a29" : "#7a9db1";
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  const [x, y] = project(hypocenter);
  ctx.globalAlpha = depth;
  ctx.beginPath();
  ctx.moveTo(...project(epicenter));
  ctx.lineTo(x, y);
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "#bbd6e8";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#dceaf4";
  ctx.fill();
  ctx.restore();
}

function drawShaking(
  ctx: CanvasRenderingContext2D,
  project: Project,
  reveal: number,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width * reveal, height);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const { mmi, color, lines } of contours) {
    ctx.beginPath();
    for (const line of lines) path(ctx, project, line);
    ctx.strokeStyle = color;
    ctx.globalAlpha = mmi < 4 ? 0.48 : 0.91;
    ctx.lineWidth = mmi >= 6 ? 1.6 : 1.05;
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabels(ctx: CanvasRenderingContext2D, project: Project, frame: RuptureFrame) {
  ctx.font = '500 11px "Geist Mono Variable", monospace';
  ctx.textBaseline = "middle";
  for (const { name, point } of cityLabels) {
    const [x, y] = project(point);
    ctx.beginPath();
    ctx.arc(x, y, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = "#c1d2e3";
    ctx.fill();
    ctx.textAlign = "right";
    ctx.strokeStyle = "#0b1626";
    ctx.lineWidth = 3;
    ctx.strokeText(name, x - 7, y);
    ctx.fillText(name, x - 7, y);
  }

  const [x, y] = project(epicenter);
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x, y + 12);
  ctx.strokeStyle = "#07101e";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#edf5ff";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.strokeStyle = "#0b1626";
  ctx.lineWidth = 3;
  const above = y - (frame.depth > 0.45 ? 14 : 1);
  ctx.strokeText("Epicenter", x + 16, above);
  ctx.fillStyle = "#edf5ff";
  ctx.fillText("Epicenter", x + 16, above);
}

export function drawRupture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: RuptureFrame,
): void {
  ctx.clearRect(0, 0, width, height);
  const project = projector(frame, width, height);
  mapSheet(ctx, project, frame.depth);
  if (frame.depth > 0) drawFault(ctx, project, frame);
  if (frame.reveal > 0) drawShaking(ctx, project, frame.reveal, width, height);
  drawLabels(ctx, project, frame);
  if (frame.depth >= 1 && frame.modelTime < MODEL_SECONDS) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#c1d2e3";
    ctx.fillText(`MODEL +${Math.floor(frame.modelTime).toString().padStart(3, "0")} s`, 16, 21);
  }
}
