export const FLIGHT_END = 9200;
export const CHAPTERS = [
  { id: "sun", label: "Sun", at: 0 },
  { id: "wind", label: "Solar wind", at: 5100 },
  { id: "earth", label: "Earth", at: FLIGHT_END },
] as const;
type Leg = (typeof CHAPTERS)[number]["id"];

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const interval = (at: number, from: number, to: number) => smooth((at - from) / (to - from));

export function solarFrame(at: number) {
  const leg: Leg = at < 3000 ? "sun" : at < 7100 ? "wind" : "earth";
  return {
    leg,
    push: interval(at, 0, 3250),
    depart: interval(at, 1700, 5350),
    diskOpacity: 1 - interval(at, 2400, 4750),
    windOpacity: interval(at, 2650, 4700) * (1 - interval(at, 6350, 8700)),
    veil: 1 - interval(at, 6700, FLIGHT_END),
  };
}

export const windStreaks = Array.from({ length: 58 }, (_, index) => {
  const x = ((index * 379 + 43) % 887) - 46;
  const y = ((index * 137 + 2) % 340) + 1;
  const length = 7 + ((index * 23) % 51);
  const angle = ((y - 170) * length) / 660;
  return { path: `M${x} ${y} l${length} ${angle.toFixed(1)}`, opacity: 0.16 + (index % 8) * 0.082 };
});
