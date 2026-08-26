import { DEG, EARTH_RADIUS_KM } from "./sphere";
import { gmstDeg } from "./stars";

/*
 * Where the moon is, in the same frame as everything else on this globe.
 *
 * The sky went in first and made this cheap: there was already a sidereal rotation to put a right
 * ascension over a longitude, and already a convention that a celestial body is reported as the point on
 * Earth it stands over. The moon is one more of those, and unlike the stars it moves fast enough that
 * getting it wrong would be obvious within a night.
 *
 * **It sits at its real distance, which is only possible because that distance is small.** The globe is a
 * unit sphere, so the moon is 60 radii out and a quarter of a radius across - both numbers small enough to
 * put on screen literally. It comes out half a degree wide, which is what the moon is, and it shifts
 * slightly against the stars as the camera moves, which is what parallax is. Nothing here is scaled for
 * effect, and a viewer who thinks it looks too small is seeing the sky correctly.
 *
 * **The phase is not computed.** Lighting a sphere with the direction the sun already points gives the
 * crescent for free, including which way it faces, which is the part hand-rolled phase code gets wrong.
 * See `globe/moon.ts`.
 *
 * **Fourteen terms of longitude and eight of latitude, and the count was set by a consumer.** The first
 * version kept seven and four, which is good to about a tenth of a degree - far finer than a ten-pixel
 * disc can show, and the honest limit was stated rather than implied. Then `eclipse.ts` started
 * multiplying this position by sixty Earth radii of lever arm, where a tenth of a degree is 670km of
 * shadow on the ground, and the 2024 April eclipse came out over New Mexico instead of Chihuahua. The
 * extra terms cost constants and nothing else.
 *
 * It is still not an ephemeris. UTC is used where the series wants Terrestrial Time, which in this decade
 * is about 69 seconds and a further 70km of shadow, and the truncation is the larger error of the two.
 * Good enough to draw where a shadow was; never good enough to tell anybody where to stand.
 */

/** Mean radius, in the same kilometres the globe's own radius is quoted in. */
export const MOON_RADIUS_KM = 1737.4;

export interface Moon {
  /** Longitude the moon stands over, in the app's geographic frame. */
  lon: number;
  /** Latitude it stands over: its declination. */
  lat: number;
  /** Centre-to-centre, in kilometres. Varies by about 13% over a month. */
  distanceKm: number;
}

/** Julian centuries since J2000.0, matching `sun.ts` so the two agree about what time it is. */
function julianCentury(at: number): number {
  return (at / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;
}

const sin = (deg: number): number => Math.sin(deg * DEG);
const cos = (deg: number): number => Math.cos(deg * DEG);

export function moonPosition(at: number): Moon {
  const t = julianCentury(at);

  /*
   * The five arguments the abridged series is built from.
   *
   * `elongation` is the moon's angular distance from the sun and is what drives the phase, so the terms
   * carrying it are the ones that matter most for how the moon looks rather than only where it is.
   */
  const meanLongitude = 218.3164477 + 481_267.881_234_21 * t;
  const meanAnomaly = 134.9633964 + 477_198.867_505_5 * t;
  const argOfLatitude = 93.2720950 + 483_202.017_523_3 * t;
  const elongation = 297.8501921 + 445_267.111_403_5 * t;
  const sunAnomaly = 357.5291092 + 35_999.050_29 * t;

  // Ecliptic longitude and latitude, degrees.
  const lambda = meanLongitude
    + 6.289 * sin(meanAnomaly)
    + 1.274 * sin(2 * elongation - meanAnomaly)
    + 0.658 * sin(2 * elongation)
    + 0.214 * sin(2 * meanAnomaly)
    - 0.186 * sin(sunAnomaly)
    - 0.114 * sin(2 * argOfLatitude)
    + 0.059 * sin(2 * elongation - 2 * meanAnomaly)
    + 0.057 * sin(2 * elongation - sunAnomaly - meanAnomaly)
    + 0.053 * sin(2 * elongation + meanAnomaly)
    + 0.046 * sin(2 * elongation - sunAnomaly)
    - 0.041 * sin(sunAnomaly - meanAnomaly)
    - 0.035 * sin(elongation)
    - 0.031 * sin(sunAnomaly + meanAnomaly);
  const beta = 5.128 * sin(argOfLatitude)
    + 0.281 * sin(meanAnomaly + argOfLatitude)
    - 0.278 * sin(argOfLatitude - meanAnomaly)
    - 0.173 * sin(2 * elongation - argOfLatitude)
    + 0.055 * sin(2 * elongation + argOfLatitude - meanAnomaly)
    - 0.046 * sin(2 * elongation - argOfLatitude - meanAnomaly)
    + 0.033 * sin(2 * elongation + argOfLatitude)
    + 0.017 * sin(2 * meanAnomaly + argOfLatitude);
  const distanceKm = 385_001
    - 20_905 * cos(meanAnomaly)
    - 3_699 * cos(2 * elongation - meanAnomaly)
    - 2_956 * cos(2 * elongation)
    - 570 * cos(2 * meanAnomaly);

  // Ecliptic to equatorial. The obliquity is the same expression `sun.ts` uses, to first order.
  const obliquity = 23.439_291 - 0.013_004_2 * t;
  const declination = Math.asin(
    sin(beta) * cos(obliquity) + cos(beta) * sin(obliquity) * sin(lambda),
  ) / DEG;
  const rightAscension = Math.atan2(
    sin(lambda) * cos(obliquity) - Math.tan(beta * DEG) * sin(obliquity),
    cos(lambda),
  ) / DEG;

  /*
   * Right ascension to longitude, which is the one line that ties this to the rest of the globe.
   *
   * Identical to what the star field does, and it has to be: a moon placed by a different convention
   * than the sky behind it would drift through the constellations it is supposed to be passing.
   */
  let lon = rightAscension - gmstDeg(at);
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lon, lat: declination, distanceKm };
}

/** Distance in globe radii, which is what the scene needs to place it. */
export function moonRadii(distanceKm: number): number {
  return distanceKm / EARTH_RADIUS_KM;
}
