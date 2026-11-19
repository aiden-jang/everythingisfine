import type { VisitEvidence } from "./visitEvidence";
import { evidenceTrace } from "./EvidenceCard";
import { cardText } from "./cardText";

export async function exportEvidence(evidence: VisitEvidence) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable.");
  const draw: (() => void)[] = [];
  const text = (value: string, top: number, size = 28, weight = 400) => {
    const font = `${weight} ${size}px "Geist Variable", sans-serif`;
    ctx.font = font;
    const lines = cardText(value, (line) => ctx.measureText(line).width, 920);
    draw.push(() => {
      ctx.font = font;
      lines.forEach((line, index) => ctx.fillText(line, 80, top + index * size * 1.4));
    });
    return top + lines.length * size * 1.4;
  };
  text("meanwhile.", 90, 30, 550);
  let y = text(evidence.title, 200, 64, 550);
  y = text(evidence.place, y + 24, 32);
  y = text(evidence.kind, y + 20, 24);
  if (evidence.trace) {
    const chart = evidenceTrace(evidence.trace, 920, 200);
    const top = y + 35;
    draw.push(() => {
      ctx.save();
      ctx.translate(80, top);
      ctx.beginPath();
      chart.points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = "#27535e";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (chart.selected) {
        ctx.beginPath();
        ctx.arc(chart.selected[0], chart.selected[1], 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    y += 265;
    y = text(`${chart.low.toFixed(2)}–${chart.high.toFixed(2)} ${evidence.trace.unit}`, y, 24);
    y = text(`${evidence.trace.start} — ${evidence.trace.end}`, y + 8, 20);
  }
  y = text(evidence.reading, y + 55, 52, 550);
  y = text(evidence.time, y + 20, 26);
  y = text(evidence.detail, y + 35, 26);
  y = text(evidence.source, Math.max(1170, y + 30), 24, 550);
  y = text(evidence.url, y + 20, 20);
  canvas.height = Math.max(1350, Math.ceil(y + 60));
  ctx.fillStyle = "#e4edeb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#102730";
  draw.forEach((paint) => paint());
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("The image could not be created."))),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `meanwhile-${evidence.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
