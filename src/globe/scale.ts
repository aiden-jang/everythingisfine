/*
 * A scale on the map, and the reason it has to name a latitude.
 *
 * The globe implies scale by being a globe: a sphere on screen carries its own size, and nobody reads
 * a distance off it because nobody expects to. A flat map invites exactly that reading and gave
 * nothing to read it against.
 *
 * **On this projection a horizontal bar is only true where it is drawn.** Equirectangular spaces
 * meridians evenly, so a degree of longitude occupies the same pixels at 60 degrees north as it does
 * at the equator while covering half the ground. A bar labelled "500 km" with no latitude on it is
 * therefore wrong nearly everywhere, by up to a factor of eleven at the poleward limit this camera
 * allows. So the label carries the latitude it was measured at, and the bar's length in kilometres
 * changes as the view moves north or south. That is the projection's distortion, stated rather than
 * smoothed over, which is the same call as refusing to draw Greenland's area as a fact.
 *
 * A vertical bar would need no such caveat: latitude scale is constant everywhere here. It is not the
 * bar people look for on a map, so the horizontal one is drawn and told the truth about instead.
 */

/**
 * Kilometres in one degree of latitude, from the mean Earth radius.
 *
 * Mean rather than equatorial. The difference is 0.3 percent, well inside the rounding a scale bar
 * does anyway, and a spherical Earth is already the assumption everywhere else here.
 */
export const KM_PER_DEGREE = (Math.PI * 6371) / 180;

/**
 * The lengths a bar is allowed to be.
 *
 * Cartographic practice, and the reason is legibility rather than tradition: a bar reading "1,483 km"
 * is a measurement, and a scale bar is a ruler. The reader is meant to halve it by eye, so it has to
 * be a number that halves.
 *
 * The range is wider than this camera needs at either end. At the map's tightest zoom a bar is around
 * a thousand kilometres, and at 85 degrees, where `cos` has taken eleven twelfths of it away, around a
 * hundred. The small steps cost nothing and stop a future zoom ceiling silently bottoming this out.
 */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000] as const;

export interface ScaleBar {
  /** The round number the bar is labelled with. */
  km: number;
  /** How long that is on screen, which is what varies. */
  px: number;
}

/**
 * The roundest bar near a target width, or null when there is no scale to draw.
 *
 * Chosen in log space, so 300 is not always rounded up to 500: 300 is 1.67 times 200 and 0.6 times
 * 500, and linear distance would call the larger one nearer when proportionally it is not.
 */
export function niceScale(kmPerPx: number, targetPx: number): ScaleBar | null {
  if (!Number.isFinite(kmPerPx) || kmPerPx <= 0 || targetPx <= 0) return null;
  const wanted = kmPerPx * targetPx;
  let best = STEPS[0] as number;
  for (const step of STEPS) {
    if (Math.abs(Math.log(step / wanted)) < Math.abs(Math.log(best / wanted))) best = step;
  }
  const px = best / kmPerPx;
  /*
   * Nothing rather than nonsense, when the table cannot reach the view.
   *
   * `> 0` is not the guard it looks like: `Math.cos` of ninety degrees is 6.1e-17 rather than zero, so
   * a pole-on view passed it and asked for a bar 1.5e14 pixels wide. The steps are spaced by factors
   * of two and two and a half, so a bar is never more than about 1.6 times off the target; eight times
   * off means the view is outside the table entirely, at which point no scale is the honest answer.
   */
  if (px > targetPx * 8 || px < targetPx / 8) return null;
  return { km: best, px };
}

/**
 * Kilometres per screen pixel across the map, at a latitude.
 *
 * The `cos` is the whole point of this module. Without it the bar is an equatorial measurement being
 * printed over Alaska.
 */
export function kmPerPixel(degPerPx: number, lat: number): number {
  return degPerPx * KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
}

/**
 * `38°N`, and a bare `0°` at the equator, where neither hemisphere is true.
 *
 * Rounded to the degree because the bar is a ruler and not a coordinate: a tenth of a degree of
 * precision on the place a scale was measured would imply the scale is that exact, and it is exact
 * only along one screen row.
 */
export function latitudeLabel(lat: number): string {
  const whole = Math.round(lat);
  if (whole === 0) return "0°";
  return `${Math.abs(whole)}°${whole > 0 ? "N" : "S"}`;
}
