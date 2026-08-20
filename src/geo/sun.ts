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

/*
 * Two things the terminator already knew and nothing read.
 *
 * `subsolarPoint` is computed every minute to light the globe, and it answers "what was it like there,
 * then" for free. An earthquake at three in the morning, when everyone is asleep and indoors, is a
 * different event from the same rupture at three in the afternoon, and the app held the arithmetic to
 * say so and never did.
 *
 * **Solar time rather than clock time, and that is the keyless answer rather than a lazy one.** Civil
 * time needs timezone boundaries, which is a dataset or a service, and the project renders its first
 * frame for anyone who clones it. Solar time needs the sun, which is already here. It is also the more
 * honest quantity for the question: what matters is where the sun was, not which side of a political
 * line the epicentre fell on.
 */

/**
 * Local apparent solar time at a longitude, in hours from midnight.
 *
 * Noon is where the true sun crosses the meridian, so this is anchored on the subsolar longitude and
 * every 15 degrees east of it is an hour later. Apparent rather than mean, because `subsolarPoint`
 * already carries the equation of time and dropping it here would put this up to a quarter of an hour
 * out for no reason.
 */
export function solarHour(lon: number, at: number): number {
  const { lon: sub } = subsolarPoint(at);
  let east = lon - sub;
  // Wrapped, or a point either side of the antimeridian from the sun reads a day away from the truth.
  east -= Math.round(east / 360) * 360;
  const hour = 12 + east / 15;
  return ((hour % 24) + 24) % 24;
}

/**
 * How high the sun stood over a place at a moment, in degrees above the horizon.
 *
 * The zenith angle is the angular distance from the point to the subsolar point, so this is one
 * spherical cosine and no more. Negative below the horizon, which is what makes the bands below
 * possible without a sunrise calculation.
 */
export function sunElevation(lon: number, lat: number, at: number): number {
  const sub = subsolarPoint(at);
  const phi = lat * DEG;
  const dec = sub.lat * DEG;
  let east = lon - sub.lon;
  east -= Math.round(east / 360) * 360;
  const cosZenith =
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(east * DEG);
  return Math.asin(Math.max(-1, Math.min(1, cosZenith))) / DEG;
}

/**
 * Daylight, twilight or dark, on the conventional boundaries.
 *
 * Civil twilight is the sun within six degrees of the horizon, which is the same figure the night
 * shader spreads its terminator over, so the words here and the band on the globe agree by
 * construction rather than by coincidence.
 *
 * Derived from elevation rather than from the clock, because at high latitude three in the morning is
 * broad daylight for months and a band read off the hour would say the opposite.
 */
export function daylight(elevationDeg: number): "daylight" | "twilight" | "dark" {
  if (elevationDeg > 0) return "daylight";
  if (elevationDeg > -6) return "twilight";
  return "dark";
}

/** `03:12`, on a 24-hour clock, from an hour that may be fractional. */
export function solarClock(hour: number): string {
  const total = Math.round(((hour % 24) + 24) % 24 * 60);
  // Rounding 23:59:40 up must give 00:00 rather than 24:00, which is not a time.
  const m = total % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
