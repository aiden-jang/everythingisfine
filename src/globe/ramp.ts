import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";

/*
 * The only place hue is allowed to exist.
 *
 * The warm ramp and the colourblind ramp between them occupy most of the wheel, so keeping every stop in one
 * file makes the rule enforceable: if a colour is not here it is chrome, and chrome is achromatic.
 *
 * Uploaded as a 256-pixel texture. Switching ramps is one uniform swap rather than fifty thousand colour
 * rewrites, and the shader has no way to express a colour that is not on the ramp.
 */

export type RampName = "thermal" | "cividis";

const STOPS: Record<RampName, readonly string[]> = {
  /** Default, for magnitude. Dark to hot, perceptually ordered. */
  thermal: ["#3B2A63", "#8A2F55", "#C7452F", "#E8791B", "#F5C242"],
  /** The same data, deuteranopia-safe by construction. */
  cividis: ["#00224E", "#35618F", "#7D8E92", "#B5A15B", "#FEE838"],
};

/**
 * The magnitude range the ramp spans. Not the range earthquakes occupy, which reaches past 9: almost
 * everything reported sits between 1 and 6, and stretching to 9 would spend most of the resolution on a band
 * that is empty for months. Above 7.5 the colour clamps and radius keeps growing.
 */
export const MAG_MIN = 1;
export const MAG_MAX = 7.5;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WIDTH = 256;

/**
 * A ramp as a 1D texture. Interpolated in sRGB between the stops, which is not the perceptually correct space
 * and is right anyway: the stops were picked by eye against this background, and interpolating in a space they
 * were not chosen in moves the midtones somewhere nobody looked at.
 */
export function rampTexture(name: RampName): DataTexture {
  const stops = STOPS[name].map(hexToRgb);
  const data = new Uint8Array(WIDTH * 4);

  for (let i = 0; i < WIDTH; i += 1) {
    const t = (i / (WIDTH - 1)) * (stops.length - 1);
    const lo = Math.min(stops.length - 2, Math.floor(t));
    const f = t - lo;
    const a = stops[lo]!;
    const b = stops[lo + 1]!;
    data[i * 4] = Math.round(a[0] + (b[0] - a[0]) * f);
    data[i * 4 + 1] = Math.round(a[1] + (b[1] - a[1]) * f);
    data[i * 4 + 2] = Math.round(a[2] + (b[2] - a[2]) * f);
    data[i * 4 + 3] = 255;
  }

  const texture = new DataTexture(data, WIDTH, 1, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Sampled straight from the same table the shader uses, so the legend cannot drift from the data. */
export function rampColorAt(name: RampName, t: number): string {
  const stops = STOPS[name].map(hexToRgb);
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const lo = Math.min(stops.length - 2, Math.floor(p));
  const f = p - lo;
  const a = stops[lo]!;
  const b = stops[lo + 1]!;
  const mix = (i: number): number => Math.round(a[i]! + (b[i]! - a[i]!) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
