/* A scale bar on the map, and the reason it has to name a latitude. See ARCHITECTURE.md#srcglobescalets. */

/** Kilometres in one degree of latitude, from the mean Earth radius. Mean rather than equatorial: the
 * difference is 0.3 percent, well inside the rounding a scale bar does anyway. */
export const KM_PER_DEGREE = (Math.PI * 6371) / 180;

/**
 * The lengths a bar is allowed to be. A bar reading "1,483 km" is a measurement and a scale bar is a
 * ruler: the reader halves it by eye, so it has to be a number that halves. See ARCHITECTURE.md#srcglobescalets.
 */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000] as const;

export interface ScaleBar {
  /** The round number the bar is labelled with. */
  km: number;
  /** How long that is on screen, which is what varies. */
  px: number;
}

/**
 * The roundest bar near a target width, or null when there is no scale to draw. Chosen in log space, so 300
 * is not always rounded up to 500: 300 is 1.67 times 200 and 0.6 times 500.
 */
export function niceScale(kmPerPx: number, targetPx: number): ScaleBar | null {
  if (!Number.isFinite(kmPerPx) || kmPerPx <= 0 || targetPx <= 0) return null;
  const wanted = kmPerPx * targetPx;
  let best = STEPS[0] as number;
  for (const step of STEPS) {
    if (Math.abs(Math.log(step / wanted)) < Math.abs(Math.log(best / wanted))) best = step;
  }
  const px = best / kmPerPx;
  /* Nothing rather than nonsense, when the table cannot reach the view. See ARCHITECTURE.md#srcglobescalets. */
  if (px > targetPx * 8 || px < targetPx / 8) return null;
  return { km: best, px };
}

/**
 * Kilometres per screen pixel across the map, at a latitude. The `cos` is the whole point of this module:
 * without it the bar is an equatorial measurement being printed over Alaska.
 */
export function kmPerPixel(degPerPx: number, lat: number): number {
  return degPerPx * KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
}

/**
 * `38°N`, and a bare `0°` at the equator, where neither hemisphere is true. Rounded to the degree, because
 * a tenth of a degree would imply the scale is that exact, and it is exact only along one screen row.
 */
export function latitudeLabel(lat: number): string {
  const whole = Math.round(lat);
  if (whole === 0) return "0°";
  return `${Math.abs(whole)}°${whole > 0 ? "N" : "S"}`;
}
