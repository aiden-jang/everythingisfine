import { RADAR_BOUNDS } from "../../sources/radar";
import type { RadarCamera } from "./radarCamera";
import data from "./us-map.json";

const LON_SCALE = 0.81;
const land = new Path2D();
const states = new Path2D();

function addLine(path: Path2D, line: number[][]) {
  const [x, y] = line[0]!;
  path.moveTo(x! * LON_SCALE, -y!);
  for (const [x, y] of line.slice(1)) path.lineTo(x! * LON_SCALE, -y!);
}

for (const polygon of data.coast) {
  for (const ring of polygon) {
    addLine(land, ring);
    land.closePath();
  }
}
for (const line of data.states) addLine(states, line);

const places = [
  ["Seattle", -122.33, 47.61],
  ["San Francisco", -122.42, 37.77],
  ["Los Angeles", -118.24, 34.05],
  ["Phoenix", -112.07, 33.45],
  ["Denver", -104.99, 39.74],
  ["Dallas", -96.8, 32.78],
  ["Minneapolis", -93.27, 44.98],
  ["Chicago", -87.63, 41.88],
  ["New Orleans", -90.07, 29.95],
  ["Atlanta", -84.39, 33.75],
  ["Miami", -80.19, 25.76],
  ["New York", -74, 40.71],
  ["Boston", -71.06, 42.36],
] as const;

export function drawRadar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: RadarCamera,
  image: ImageBitmap | null,
) {
  const [west, south, east, north] = RADAR_BOUNDS;
  const span = camera.span;
  const scale = Math.min(width / span, height / (span * 0.56));
  const { lon, lat, roll, pitch } = camera;
  const sea = ctx.createLinearGradient(0, 0, width * 0.85, height);
  sea.addColorStop(0, "#0e1c31");
  sea.addColorStop(1, "#081424");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(roll);
  ctx.scale(scale, scale * pitch);
  ctx.translate(-lon * LON_SCALE, lat);

  ctx.fillStyle = "#192e42";
  ctx.fill(land, "evenodd");
  ctx.strokeStyle = "#7a98ad";
  ctx.lineWidth = 0.85 / scale;
  ctx.stroke(land);

  if (image && image.width) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, west * LON_SCALE, -north, (east - west) * LON_SCALE, north - south);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.strokeStyle = "rgba(169,196,214,0.52)";
  ctx.lineWidth = 0.7 / scale;
  ctx.stroke(states);
  ctx.restore();

  if (span > 37 && width < 500) return;
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  ctx.font = '550 11px "Geist Mono Variable", monospace';
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0b1829";
  ctx.fillStyle = "#d9e7f0";
  const labels: { x: number; y: number; end: number }[] = [];
  for (const [name, placeLon, placeLat] of places) {
    const dx = (placeLon - lon) * LON_SCALE * scale;
    const dy = (lat - placeLat) * scale * pitch;
    const x = width / 2 + dx * cos - dy * sin;
    const y = height / 2 + dx * sin + dy * cos;
    const end = x + ctx.measureText(name).width + 9;
    if (x < 10 || end > width - 8 || y < 46 || y > height - 12) continue;
    if (labels.some((label) => Math.abs(y - label.y) < 14 && x < label.end && end > label.x)) continue;
    labels.push({ x, y, end });
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeText(name, x + 6, y + 4);
    ctx.fillText(name, x + 6, y + 4);
  }
}
