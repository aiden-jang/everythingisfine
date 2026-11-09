import { clamp, infrared, latestScan, sprite, vapor } from "./tongaTimeline";

export interface Satellite {
  infrared: HTMLImageElement | null;
  vapor: HTMLImageElement | null;
}

function tile(ctx: CanvasRenderingContext2D, image: HTMLImageElement, index: number, scale: number) {
  const { width, height, columns } = sprite;
  ctx.drawImage(
    image,
    (index % columns) * width,
    Math.floor(index / columns) * height,
    width,
    height,
    ((1 - scale) * width) / 2,
    ((1 - scale) * height) / 2,
    width * scale,
    height * scale,
  );
}

export function paintTongaScan(
  ctx: CanvasRenderingContext2D,
  minute: number,
  images: Satellite,
  vaporMix: number,
  still: boolean,
) {
  ctx.clearRect(0, 0, sprite.width, sprite.height);
  if (images.infrared && vaporMix < 1) {
    tile(
      ctx,
      images.infrared,
      latestScan(infrared, minute),
      still ? 1 : 1 + clamp((minute - 250) / 40) * 0.14,
    );
  }
  if (images.vapor && vaporMix > 0) {
    ctx.save();
    ctx.globalAlpha = vaporMix;
    tile(ctx, images.vapor, latestScan(vapor, minute), 1);
    ctx.restore();
  }
}
