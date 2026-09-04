import { EARTH_RADIUS_KM, toVec3 } from "./sphere";
import { moonPosition, moonRadii, MOON_RADIUS_KM } from "./moon";
import { subsolarPoint } from "./sun";

/* Where the moon's shadow falls on the Earth. Nothing new is measured: the sun's direction and the moon's
   position are both already on screen, and an eclipse is those two multiplied. See ARCHITECTURE.md#srcgeoeclipsets. */

/** Mean Earth-sun distance in globe radii. The 1.7% annual variation moves the umbra by under a km. */
const SUN_DISTANCE = 149_597_870 / EARTH_RADIUS_KM;
/** The sun's own radius, same units, for the half-angle of the shadow cone. */
const SUN_RADIUS = 696_340 / EARTH_RADIUS_KM;

export interface Eclipse {
  /** Unit vector to where the axis meets the surface, or to the point nearest it when it misses. */
  centre: [number, number, number];
  /** Perpendicular radius of the umbra where the axis meets the Earth, in globe radii. Negative means the
   * cone closed before it arrived: the eclipse is annular rather than total. */
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
  const away: [number, number, number] = [moonAt[0] - sunAt[0], moonAt[1] - sunAt[1], moonAt[2] - sunAt[2]];
  const awayLen = Math.hypot(away[0], away[1], away[2]);
  const dir: [number, number, number] = [away[0] / awayLen, away[1] / awayLen, away[2] / awayLen];

  /*
   * Closest approach of the axis to the Earth's centre, then the near intersection if there is one. Using the
   * closest approach when the axis misses keeps `centre` meaningful on the days there is no eclipse.
   */
  const along = -dot(moonAt, dir);

  /* The moon has to be between the sun and the Earth, and a distance check alone does not say so. See
     ARCHITECTURE.md. */
  if (along <= 0) {
    const behind = Math.hypot(
      moonAt[0] + along * dir[0],
      moonAt[1] + along * dir[1],
      moonAt[2] + along * dir[2],
    );
    const lit = toVec3(sun.lon, sun.lat, 1);
    return { centre: lit, umbra: 0, penumbra: 0, gap: behind, touching: false };
  }
  const closest: [number, number, number] = [
    moonAt[0] + along * dir[0],
    moonAt[1] + along * dir[1],
    moonAt[2] + along * dir[2],
  ];
  const gap = Math.hypot(closest[0], closest[1], closest[2]);

  const inside = 1 - gap * gap;
  const reach = inside > 0 ? along - Math.sqrt(inside) : along;
  const hit: [number, number, number] = [
    moonAt[0] + reach * dir[0],
    moonAt[1] + reach * dir[1],
    moonAt[2] + reach * dir[2],
  ];
  const hitLen = Math.hypot(hit[0], hit[1], hit[2]) || 1;
  const centre: [number, number, number] = [hit[0] / hitLen, hit[1] / hitLen, hit[2] / hitLen];

  // The cone's half-angle is the sun's angular radius from the moon, and both cones share it: the umbra
  // converges at that rate and the penumbra diverges at it.
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

/*
 * And the other way round: the Earth's shadow on the moon. The same cone arithmetic with the bodies swapped,
 * and the numbers come out completely differently - the Earth's umbra is 0.72 radii wide where the moon
 * crosses it and the moon is 0.27 across, which is why a total lunar eclipse lasts an hour.
 */

export interface LunarEclipse {
  /** How much of the moon's face is inside the umbra: 0 clear, 1 wholly swallowed. */
  umbral: number;
  /** True once any part of it is inside the penumbra, which is the faint outer shading. */
  penumbral: boolean;
  /** Perpendicular distance from the anti-solar axis, in globe radii. */
  offset: number;
}

export function lunarEclipse(at: number): LunarEclipse {
  const sun = subsolarPoint(at);
  const sunAt = toVec3(sun.lon, sun.lat, SUN_DISTANCE);
  const sunLen = Math.hypot(sunAt[0], sunAt[1], sunAt[2]);
  // The shadow runs from the sun through the Earth's centre, so the axis is simply the anti-solar ray.
  const axis: [number, number, number] = [-sunAt[0] / sunLen, -sunAt[1] / sunLen, -sunAt[2] / sunLen];

  const moon = moonPosition(at);
  const moonAt = toVec3(moon.lon, moon.lat, moonRadii(moon.distanceKm));
  const along = dot(moonAt, axis);
  const offset = Math.hypot(
    moonAt[0] - along * axis[0],
    moonAt[1] - along * axis[1],
    moonAt[2] - along * axis[2],
  );

  // Behind the Earth or in front of it. A negative `along` puts the moon on the sunward side, where it
  // cannot be in shadow however small its offset - every new moon, and the case a distance test alone would
  // call a total eclipse.
  if (along <= 0) return { umbral: 0, penumbral: false, offset };

  const spread = Math.tan(Math.asin(SUN_RADIUS / sunLen));
  const umbra = 1 - along * spread;
  const penumbra = 1 + along * spread;
  const moonR = moonRadii(MOON_RADIUS_KM);

  // A fraction of the face rather than a flag, so the shader can dim through a partial eclipse instead of
  // switching. Linear across the diameter: crude, and invisible on a disc eleven pixels wide.
  const umbral = Math.max(0, Math.min(1, (umbra + moonR - offset) / (2 * moonR)));
  return { umbral, penumbral: offset < penumbra + moonR, offset };
}
