import { EARTH_RADIUS_KM, toVec3 } from "./sphere";
import { moonPosition, moonRadii, MOON_RADIUS_KM } from "./moon";
import { subsolarPoint } from "./sun";

/*
 * Where the moon's shadow falls on the Earth.
 *
 * Nothing new is measured here. The sun's direction and the moon's position are both already on screen,
 * and a solar eclipse is the one place those two facts multiply into a third: the shadow axis runs from
 * the sun through the moon, and where it meets the planet is where somebody is standing in the dark.
 * Getting the light to follow the day on screen is what made this reachable at all - the shadow of
 * tonight's moon over an archived April would be nonsense.
 *
 * **It is a picture, not a prediction, and the copy has to say so.** The lunar series behind this is
 * accurate to about a tenth of a degree, and a tenth of a degree at sixty Earth radii of lever arm moves
 * the shadow about 670km across the surface. That is fine against a penumbra 3,500km wide and useless for
 * telling anybody when to look up. This draws roughly where the shadow was; it must never be read as a
 * time or a place to stand.
 *
 * **The umbra is a difference of two large numbers, which is why totality is marginal in reality.** The
 * moon's shadow cone converges at the sun's own angular radius, so it narrows by about 0.0047 Earth radii
 * per radius travelled, and it has to cross roughly sixty of them. It arrives at nearly exactly nothing:
 * a few hundred kilometres wide when the moon is near perigee, and short of the surface altogether when it
 * is near apogee, which is the difference between a total eclipse and an annular one. That falls out of
 * the arithmetic rather than being decided here, and the sign of `umbra` is what carries it.
 */

/** Mean Earth-sun distance in globe radii. The 1.7% annual variation moves the umbra by under a km. */
const SUN_DISTANCE = 149_597_870 / EARTH_RADIUS_KM;
/** The sun's own radius, same units, for the half-angle of the shadow cone. */
const SUN_RADIUS = 696_340 / EARTH_RADIUS_KM;

export interface Eclipse {
  /** Unit vector to where the axis meets the surface, or to the point nearest it when it misses. */
  centre: [number, number, number];
  /**
   * Perpendicular radius of the umbra where the axis meets the Earth, in globe radii.
   *
   * Negative means the cone closed before it arrived: the moon is too far to cover the sun, and the
   * eclipse is annular rather than total.
   */
  umbra: number;
  /** Perpendicular radius of the penumbra, in globe radii. Around 0.55, so about 3,500km. */
  penumbra: number;
  /** Perpendicular distance from the Earth's centre to the axis. Under 1 means the axis strikes it. */
  gap: number;
  /** Whether any part of the penumbra reaches the planet at all. False on almost every day. */
  touching: boolean;
}

const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

export function solarEclipse(at: number): Eclipse {
  const sun = subsolarPoint(at);
  const sunAt = toVec3(sun.lon, sun.lat, SUN_DISTANCE);
  const moon = moonPosition(at);
  const moonAt = toVec3(moon.lon, moon.lat, moonRadii(moon.distanceKm));

  // The axis, pointing away from the sun.
  const away: [number, number, number] = [
    moonAt[0] - sunAt[0], moonAt[1] - sunAt[1], moonAt[2] - sunAt[2],
  ];
  const awayLen = Math.hypot(away[0], away[1], away[2]);
  const dir: [number, number, number] = [away[0] / awayLen, away[1] / awayLen, away[2] / awayLen];

  /*
   * Closest approach of the axis to the Earth's centre, then the near intersection if there is one.
   *
   * `along` is how far past the moon the closest point lies, so it is also very nearly the moon-to-Earth
   * distance the shadow cone has to cross. Using the closest approach rather than the intersection when
   * the axis misses keeps `centre` meaningful on the days there is no eclipse, which is most of them.
   */
  const along = -dot(moonAt, dir);
  const closest: [number, number, number] = [
    moonAt[0] + along * dir[0], moonAt[1] + along * dir[1], moonAt[2] + along * dir[2],
  ];
  const gap = Math.hypot(closest[0], closest[1], closest[2]);

  const inside = 1 - gap * gap;
  const reach = inside > 0 ? along - Math.sqrt(inside) : along;
  const hit: [number, number, number] = [
    moonAt[0] + reach * dir[0], moonAt[1] + reach * dir[1], moonAt[2] + reach * dir[2],
  ];
  const hitLen = Math.hypot(hit[0], hit[1], hit[2]) || 1;
  const centre: [number, number, number] = [hit[0] / hitLen, hit[1] / hitLen, hit[2] / hitLen];

  /*
   * The cone's half-angle is the sun's angular radius from the moon, and both cones share it: the umbra
   * converges at that rate and the penumbra diverges at it.
   */
  const spread = Math.tan(Math.asin(SUN_RADIUS / awayLen));
  const moonR = moonRadii(MOON_RADIUS_KM);
  const umbra = moonR - reach * spread;
  const penumbra = moonR + reach * spread;

  return { centre, umbra, penumbra, gap, touching: gap < 1 + penumbra };
}

/** The shadow centre as a place, for a sentence. Only meaningful while `touching`. */
export function eclipseAt(centre: readonly [number, number, number]): { lon: number; lat: number } {
  return {
    lon: Math.atan2(centre[0], centre[2]) * (180 / Math.PI),
    lat: Math.asin(Math.max(-1, Math.min(1, centre[1]))) * (180 / Math.PI),
  };
}
