import { rainviewerTiles } from "../../sources/rainviewer";
import { forgetRainviewer, rainviewerFetch } from "./rainviewerFetch";

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
    throw new Error("Incomplete radar mosaic");
  }
  return images;
}

export async function globalRadarImage(path: string, signal: AbortSignal): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Radar canvas unavailable");
  const coverage = await tiles(undefined, signal);
  coverage.forEach((image, index) => {
    context.drawImage(image, (index % 2) * 512, Math.floor(index / 2) * 512, 512, 512);
    image.close();
  });
  const mask = context.getImageData(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4;
      const alpha = mask.data[i + 3]!;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 160;
      mask.data[i + 3] = Math.round(alpha * ((x + y) % 12 < 2 ? 0.28 : 0.035));
    }
  }
  context.putImageData(mask, 0, 0);
  const radar = await tiles(path, signal);
  radar.forEach((image, index) => {
    context.drawImage(image, (index % 2) * 512, Math.floor(index / 2) * 512, 512, 512);
    image.close();
  });
  return createImageBitmap(canvas);
}
