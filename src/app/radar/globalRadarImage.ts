import { GLOBAL_RADAR_BOUNDS, rainviewerTiles, radarMercatorY } from "../../sources/rainviewer";
import { forgetRainviewer, RainviewerConnectionError, rainviewerFetch } from "./rainviewerFetch";

async function tiles(path: string | undefined, signal: AbortSignal): Promise<ImageBitmap[]> {
  const loaded = await Promise.allSettled(
    rainviewerTiles(path).map(async (url) => {
      try {
        return await createImageBitmap(await rainviewerFetch(url, signal));
      } catch (error) {
        if (!signal.aborted) forgetRainviewer(url);
        throw error;
      }
    }),
  );
  const images = loaded.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (signal.aborted || images.length !== 4) {
    images.forEach((image) => image.close());
    signal.throwIfAborted();
    for (const result of loaded)
      if (result.status === "rejected" && result.reason instanceof RainviewerConnectionError)
        throw result.reason;
    throw new Error("Incomplete radar mosaic");
  }
  return images;
}

const SIDE = 1024;

function canvasContext() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Radar canvas unavailable");
  return context;
}

function paint(context: CanvasRenderingContext2D, images: ImageBitmap[]) {
  images.forEach((image, index) => {
    context.drawImage(image, (index % 2) * 512, Math.floor(index / 2) * 512, 512, 512);
    image.close();
  });
}

export async function globalRadarCoverage(signal: AbortSignal) {
  const context = canvasContext();
  paint(context, await tiles(undefined, signal));
  const mask = context.getImageData(0, 0, SIDE, SIDE);
  const blocked = new Uint8Array((SIDE * SIDE) / 8);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const pixel = y * SIDE + x;
      const i = pixel * 4;
      const alpha = mask.data[i + 3]!;
      if (alpha > 127) blocked[pixel >> 3]! |= 1 << (pixel & 7);
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 160;
      mask.data[i + 3] = Math.round(alpha * ((x + y) % 12 < 2 ? 0.28 : 0.035));
    }
  }

  function covers({ lon, lat }: { lon: number; lat: number }): boolean {
    if (lat < GLOBAL_RADAR_BOUNDS[1] || lat > GLOBAL_RADAR_BOUNDS[3]) return false;
    const x = Math.floor((((((lon + 180) % 360) + 360) % 360) * SIDE) / 360);
    const y = Math.min(SIDE - 1, Math.max(0, Math.floor(radarMercatorY(lat) * SIDE)));
    const pixel = y * SIDE + x;
    return (blocked[pixel >> 3]! & (1 << (pixel & 7))) === 0;
  }
  return { mask, covers };
}

export async function globalRadarImage(
  path: string,
  mask: ImageData,
  signal: AbortSignal,
): Promise<ImageBitmap> {
  const context = canvasContext();
  context.putImageData(mask, 0, 0);
  paint(context, await tiles(path, signal));
  return createImageBitmap(context.canvas);
}
