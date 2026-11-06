import { bounds, DURATION, lines, trace, type flashFrame } from "./flashTimeline";

const KM_LAT = 111.195;
const KM_LON = KM_LAT * Math.cos((36 * Math.PI) / 180);
const [west, south, east, north] = bounds;
const boundaryPath = new Path2D();
for (const line of lines) {
  const [x, y] = line[0]!;
  boundaryPath.moveTo((x! - west!) * KM_LON, (north! - y!) * KM_LAT);
  for (const [x, y] of line.slice(1)) boundaryPath.lineTo((x! - west!) * KM_LON, (north! - y!) * KM_LAT);
}
const locations = [
  ["Texas", -98.3, 33.2],
  ["Oklahoma", -97.2, 35.3],
  ["Arkansas", -91.9, 34.7],
  ["Kansas", -97.3, 38.25],
  ["Missouri", -92, 38.1],
] as const;

type Context = CanvasRenderingContext2D;
type Frame = ReturnType<typeof flashFrame>;

export function drawFlash(
  ctx: Context,
  width: number,
  height: number,
  frame: Frame,
  image: HTMLImageElement | null,
) {
  const { at, camera } = frame;
  const { lon, lat, roll, tilt } = camera;
  const scale = Math.min(width / camera.width, height / camera.height);
  const dx = (x: number) => (x - lon) * KM_LON * scale;
  const dy = (y: number) => (lat - y) * KM_LAT * scale;
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  ctx.fillStyle = "#08121f";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(roll);
  ctx.scale(1, tilt);
  if (image) ctx.drawImage(image, dx(west!), dy(north!), dx(east!) - dx(west!), dy(south!) - dy(north!));
  ctx.restore();

  const edge = ctx.createRadialGradient(
    width * 0.49,
    height * 0.51,
    Math.min(width, height) * 0.13,
    width * 0.49,
    height * 0.51,
    Math.hypot(width, height) * 0.58,
  );
  edge.addColorStop(0, "rgba(4, 10, 19, 0.08)");
  edge.addColorStop(0.7, "rgba(4, 10, 19, 0.48)");
  edge.addColorStop(1, "rgba(4, 10, 19, 0.88)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);

  const point = (x: number, y: number): [number, number] => {
    const u = dx(x);
    const v = dy(y) * tilt;
    return [width / 2 + u * cos - v * sin, height / 2 + u * sin + v * cos];
  };

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(roll);
  ctx.scale(scale, scale * tilt);
  ctx.translate(dx(west!) / scale, dy(north!) / scale);
  const span = (east! - west!) * KM_LON;
  const border = ctx.createLinearGradient(0, 0, span, 0);
  border.addColorStop(0, "transparent");
  border.addColorStop(0.12, "rgba(175, 199, 224, 0.4)");
  border.addColorStop(0.88, "rgba(175, 199, 224, 0.4)");
  border.addColorStop(1, "transparent");
  ctx.lineWidth = 0.75 / scale;
  ctx.strokeStyle = border;
  ctx.stroke(boundaryPath);
  ctx.restore();

  drawDetections(ctx, at, scale, point);
  for (const [name, x, y] of locations) {
    const [u, v] = point(x, y);
    if (u < 18 || u > width - 18 || v < 38 || v > height - 12) continue;
    ctx.font = `600 ${width < 480 ? 10 : 12}px "Geist Mono Variable", monospace`;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#081221";
    ctx.strokeText(name, u, v);
    ctx.fillStyle = "#dce7f4";
    ctx.fillText(name, u, v);
  }
  ctx.textAlign = "left";

  if (tilt === 1) {
    const x = width - 15 - 100 * scale;
    const y = height - 16;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(width - 15, y);
    ctx.lineTo(width - 15, y - 4);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#b5c8df";
    ctx.stroke();
    ctx.font = '500 10px "Geist Mono Variable", monospace';
    ctx.fillStyle = "#dae8f4";
    ctx.textAlign = "right";
    ctx.fillText("100 km", width - 15, y - 6);
    ctx.textAlign = "left";
  }
}

function drawDetections(
  ctx: Context,
  at: number,
  scale: number,
  project: (lon: number, lat: number) => [number, number],
) {
  const visible = [];
  for (const [stamp, lon, lat] of trace) {
    if (stamp > at) break;
    visible.push({ age: at - stamp, point: project(lon, lat) });
  }
  const base = Math.max(0.85, Math.min(2, 2.7 * scale));
  ctx.beginPath();
  for (const {
    point: [x, y],
  } of visible) {
    ctx.moveTo(x + base, y);
    ctx.arc(x, y, base, 0, 2 * Math.PI);
  }
  ctx.fillStyle = at === DURATION ? "#9fe8ff" : "#70a5cb";
  ctx.fill();

  if (at === DURATION) return;
  for (const {
    point: [x, y],
    age,
  } of visible) {
    if (age > 480) continue;
    const opacity = (1 - age / 480) * 0.85;
    ctx.fillStyle = `rgba(133, 202, 248, ${opacity * 0.26})`;
    ctx.beginPath();
    ctx.arc(x, y, base * 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = `rgba(227, 251, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(x, y, base * 1.22, 0, 2 * Math.PI);
    ctx.fill();
  }
}
