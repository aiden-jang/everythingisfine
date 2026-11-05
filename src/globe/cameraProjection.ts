const SHOULDER = 0.985;
const exactAngle = (px: number, distance: number, focal: number): number => {
  const u = px / focal;
  return Math.asin(Math.max(-1, Math.min(1, (u * distance) / Math.sqrt(1 + u * u)))) - Math.atan(u);
};

// Linear continuation at the limb prevents a grazing drag or panel lift from diverging.
export function perspectiveAngle(px: number, distance: number, focal: number): number {
  const limit = (focal * SHOULDER) / Math.sqrt(distance * distance - SHOULDER * SHOULDER);
  const absolute = Math.abs(px);
  if (absolute <= limit) return exactAngle(px, distance, focal);
  const at = exactAngle(limit, distance, focal);
  const slope = at - exactAngle(limit - 1, distance, focal);
  return Math.sign(px) * (at + (absolute - limit) * slope);
}
