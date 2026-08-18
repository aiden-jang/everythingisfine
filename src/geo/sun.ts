/*
 * Where the sun is overhead, right now.
 *
 * The globe was a navy disc: correct, and unlit, so it read as a diagram of Earth rather than as
 * Earth. A terminator fixes that with a fact rather than with styling. It gives the sphere a light
 * direction and it says, without a caption, that this is the planet at this moment.
 *
 * NOAA's low-precision solar position algorithm, good to about 0.01 degrees over 1950-2050. Far more
 * than a shadow edge needs, and the alternative is a hand-waved approximation sitting in an app whose
 * design document has a section called Honest Numbers.
 */

const DEG = Math.PI / 180;

export interface Subsolar {
  /** Longitude where the sun is directly overhead, in degrees east. */
  lon: number;
  /** Latitude where the sun is directly overhead: the solar declination. */
  lat: number;
}

/** Julian centuries since J2000.0. */
function julianCentury(at: number): number {
  return (at / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;
}

export function subsolarPoint(at: number): Subsolar {
  const t = julianCentury(at);

  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const centre =
    Math.sin(meanAnomaly * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * meanAnomaly * DEG) * 0.000289;

  const trueLongitude = meanLongitude + centre;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG);

  const declination = Math.asin(
    Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG),
  ) / DEG;

  /*
   * The equation of time, in minutes.
   *
   * This is the part a naive version drops, and dropping it puts the terminator up to a quarter of an
   * hour out, which is about four degrees of longitude: visible, and wrong for a reason nobody would
   * ever find.
   */
  const y = Math.tan((obliquity / 2) * DEG) ** 2;
  const equationOfTime = 4 * (
    y * Math.sin(2 * meanLongitude * DEG)
    - 2 * eccentricity * Math.sin(meanAnomaly * DEG)
    + 4 * eccentricity * y * Math.sin(meanAnomaly * DEG) * Math.cos(2 * meanLongitude * DEG)
    - 0.5 * y * y * Math.sin(4 * meanLongitude * DEG)
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * DEG)
  ) / DEG;

  // Solar noon is where the true sun crosses the meridian: UTC noon shifted by the equation of time.
  const minutesUtc = ((at % 86_400_000) + 86_400_000) % 86_400_000 / 60_000;
  const lon = -((minutesUtc + equationOfTime) / 4 - 180);

  return { lon: ((((lon + 180) % 360) + 360) % 360) - 180, lat: declination };
}
