import type { WindSample } from "../../sources/spaceWeather";

export const FLIGHT_END = 9200;
export const CHAPTERS = [
  { id: "sun", label: "Sun", at: 0 },
  { id: "wind", label: "Solar wind", at: 5100 },
  { id: "earth", label: "Earth", at: FLIGHT_END },
] as const;
export type Leg = (typeof CHAPTERS)[number]["id"];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const interval = (at: number, from: number, to: number) => smooth((at - from) / (to - from));

export function solarFrame(at: number) {
  const leg: Leg = at < 3000 ? "sun" : at < 7100 ? "wind" : "earth";
  return {
    leg,
    push: interval(at, 0, 3250),
    depart: interval(at, 1700, 5350),
    wind: interval(at, 2100, 4700) * (1 - interval(at, 6300, 8550)),
    veil: 1 - interval(at, 6800, FLIGHT_END),
  };
}

const dust = Array.from({ length: 164 }, (_, i) => ({
  x: ((i * 613 + 139) % 997) / 997,
  y: ((i * 379 + 217) % 991) / 991,
  speed: 0.68 + ((i * 421) % 31) / 65,
  depth: ((i * 197) % 53) / 53,
}));

export function paintSolarFlight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  at: number,
  image: HTMLImageElement | null,
  wind: WindSample | undefined,
) {
  const frame = solarFrame(at);
  ctx.clearRect(0, 0, width, height);
  if (frame.veil === 0) return;
  ctx.globalAlpha = frame.veil;
  for (let i = 0; i < dust.length; i += 2) {
    const star = dust[i]!;
    const x = ((star.x - frame.depart * (0.06 + star.depth * 0.09) + 1) % 1) * width;
    ctx.fillStyle = `rgba(177,198,230,${0.15 + star.depth * 0.43})`;
    const size = star.depth > 0.86 ? 1.6 : 0.9;
    ctx.fillRect(x, star.y * height, size, size);
  }

  const disk = Math.min(width * 0.86, height * 1.19) * (0.92 + frame.push * 0.22 - frame.depart * 0.26);
  const cx = width * (0.52 - 0.88 * frame.depart);
  const cy = height * (0.5 + 0.06 * frame.depart);
  if (image && cx + disk > 0) {
    ctx.globalAlpha = frame.veil * (1 - frame.depart * 0.42);
    ctx.drawImage(image, cx - disk / 2, cy - disk / 2, disk, (disk * image.height) / image.width);
  }

  if (wind && frame.wind > 0) {
    const drift = Math.min(2.3, Math.max(0.5, wind.value / 340));
    const count = wind.density === null ? 84 : Math.min(dust.length, 62 + Math.round(wind.density * 7));
    const wash = ctx.createLinearGradient(0, 0, width, height * 0.75);
    wash.addColorStop(0, "rgba(214,134,74,0.08)");
    wash.addColorStop(0.52, "rgba(66,144,195,0.02)");
    wash.addColorStop(1, "rgba(95,167,214,0.08)");
    ctx.globalAlpha = frame.wind;
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < count; i++) {
      const mote = dust[i]!;
      const along = (mote.x + (at / 3600) * drift * mote.speed) % 1;
      const spread = (mote.y - 0.5) * (0.38 + 0.62 * along);
      const x = along * (width + 55) - 26;
      const y = height * (0.52 + spread * 0.96);
      const length = 5 + drift * (6 + 46 * mote.depth ** 2);
      ctx.globalAlpha = frame.wind * (0.2 + mote.depth * 0.64);
      ctx.strokeStyle = along > 0.48 ? "#83c6e7" : "#ebb67f";
      ctx.lineWidth = 0.55 + mote.depth * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - length, y - spread * 10);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
