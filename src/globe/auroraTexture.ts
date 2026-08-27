import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";
import { AURORA_LAT, AURORA_LON, type Aurora } from "../sources/aurora";

/*
 * The aurora grid as something a shader can sample.
 *
 * RGBA rather than one red channel. `ramp.ts` already proves this path works on this renderer, and a
 * single-channel texture brings row-alignment rules that are only interesting when they are wrong.
 *
 * Linear filtering. The model publishes one-degree cells, about seven pixels at the framing shot, and
 * nearest sampling draws a picture of the grid rather than of the sky.
 */

export function auroraTexture(): DataTexture {
  const texture = new DataTexture(
    new Uint8Array(AURORA_LON * AURORA_LAT * 4),
    AURORA_LON,
    AURORA_LAT,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Copies a grid into the texture in place, so a refresh allocates nothing. */
export function writeAurora(texture: DataTexture, aurora: Aurora): void {
  const data = texture.image.data as Uint8Array;
  for (let i = 0; i < aurora.grid.length; i += 1) {
    // Probability 0-100 into a byte 0-255, so the shader's own gain is the only tuning in the path.
    const v = Math.round((aurora.grid[i]! / 100) * 255);
    const at = i * 4;
    data[at] = v;
    data[at + 1] = v;
    data[at + 2] = v;
    data[at + 3] = 255;
  }
  texture.needsUpdate = true;
}
